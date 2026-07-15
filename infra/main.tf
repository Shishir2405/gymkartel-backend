# Production infrastructure skeleton for Gym Kartel (infra/ in gymkartel-backend).
#
# SKELETON: providers + resource shapes are declared so `terraform validate`
# is meaningful, but real provisioning needs credentials wired via a secrets
# manager (Doppler / AWS Secrets Manager) and a remote state backend. Nothing
# here should be `terraform apply`-ed until the backend + variables are set.
#
# Managed services chosen to match the brief: MongoDB Atlas (managed replica
# set → change streams), an ElastiCache/Upstash Redis, CloudAMQP RabbitMQ, and
# Cloudflare R2 for object storage.

terraform {
  required_version = ">= 1.6"

  # backend "s3" { ... }  # TODO: remote state (bucket + dynamodb lock) per env

  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.18"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (staging | production)."
}

variable "atlas_org_id" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type      = string
  sensitive = true
}

# ---- MongoDB Atlas (managed replica set; change streams supported) ----------

resource "mongodbatlas_project" "gymkartel" {
  name   = "gymkartel-${var.environment}"
  org_id = var.atlas_org_id
}

resource "mongodbatlas_advanced_cluster" "primary" {
  project_id     = mongodbatlas_project.gymkartel.id
  name           = "gymkartel-${var.environment}"
  cluster_type   = "REPLICASET"
  mongo_db_major_version = "7.0"

  replication_specs {
    region_configs {
      provider_name = "AWS"
      region_name   = "AP_SOUTH_1" # Mumbai — India-first
      priority      = 7
      electable_specs {
        instance_size = var.environment == "production" ? "M30" : "M10"
        node_count    = 3
      }
    }
  }
}

# ---- Redis (ElastiCache) ----------------------------------------------------

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "gymkartel-${var.environment}"
  description          = "Gym Kartel sessions / idempotency / leaderboard hot cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.environment == "production" ? "cache.t4g.medium" : "cache.t4g.small"
  num_cache_clusters   = var.environment == "production" ? 2 : 1
  port                 = 6379
  # TODO: subnet group + security group + at-rest/in-transit encryption
}

# ---- RabbitMQ (Amazon MQ) ---------------------------------------------------

resource "aws_mq_broker" "rabbitmq" {
  broker_name        = "gymkartel-${var.environment}"
  engine_type        = "RabbitMQ"
  engine_version     = "3.13"
  host_instance_type = var.environment == "production" ? "mq.m5.large" : "mq.t3.micro"
  deployment_mode    = var.environment == "production" ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"
  publicly_accessible = false
  # TODO: users via secrets manager, subnet + SG wiring
}

# ---- Cloudflare R2 (object storage; signed URLs only) -----------------------

resource "cloudflare_r2_bucket" "share_cards" {
  account_id = var.cloudflare_account_id
  name       = "gymkartel-share-cards-${var.environment}"
}

resource "cloudflare_r2_bucket" "coach_docs" {
  account_id = var.cloudflare_account_id
  name       = "gymkartel-coach-docs-${var.environment}"
}

resource "cloudflare_r2_bucket" "transformations" {
  account_id = var.cloudflare_account_id
  name       = "gymkartel-transformations-${var.environment}"
}

output "mongo_connection_srv" {
  value     = mongodbatlas_advanced_cluster.primary.connection_strings[0].standard_srv
  sensitive = true
}
