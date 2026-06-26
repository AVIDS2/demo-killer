# =============================================================
# Risky Terraform configuration — intentionally insecure/fragile
# =============================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # NO remote backend — state stored locally (no locking, no shared access, no encryption at rest)
}

provider "aws" {
  region = "us-east-1"
}

# ---------------------------------------------------------------
# Hardcoded secrets — passwords and API keys in plaintext
# ---------------------------------------------------------------

resource "aws_db_instance" "main" {
  identifier           = "main-db"
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = "db.t3.medium"
  allocated_storage    = 20
  db_name              = "appdb"
  username             = "admin"
  password             = "SuperSecretPassword123!"  # hardcoded password
  skip_final_snapshot  = true                        # no backup on destroy
  # NO prevent_destroy lifecycle — accidental destroy wipes the database
  # NO tags — cannot track ownership, cost center, or environment
}

# ---------------------------------------------------------------
# Wildcard IAM policy — allows ANY action on ANY resource
# ---------------------------------------------------------------

resource "aws_iam_role" "app_role" {
  name = "app-service-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
  # NO tags
}

resource "aws_iam_role_policy" "app_policy" {
  name = "app-full-access"
  role = aws_iam_role.app_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = "*"       # wildcard — any action
      Effect   = "Allow"
      Resource = "*"       # any resource
    }]
  })
}

# ---------------------------------------------------------------
# S3 bucket with public access and no encryption
# ---------------------------------------------------------------

resource "aws_s3_bucket" "uploads" {
  bucket = "my-app-uploads-risky"
  # NO tags
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false  # fully public
}

# NO server-side encryption configured (SSE)
# NO versioning enabled
# NO lifecycle rules

# ---------------------------------------------------------------
# Security group with wide-open ingress
# ---------------------------------------------------------------

resource "aws_security_group" "app_sg" {
  name   = "app-sg"
  # NO tags

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]  # all traffic from anywhere
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------------------------------------------------------------
# Lambda with hardcoded environment secrets
# ---------------------------------------------------------------

resource "aws_lambda_function" "webhook" {
  function_name = "payment-webhook"
  runtime       = "nodejs18.x"
  handler       = "index.handler"
  role          = aws_iam_role.app_role.arn
  filename      = "lambda.zip"

  environment {
    variables = {
      STRIPE_SECRET_KEY  = "sk_live_FAKE_KEY_FOR_TESTING_xxxxxxxxxxxx"  # hardcoded secret
      DATABASE_PASSWORD  = "AnotherHardcodedPassword456!"               # hardcoded secret
      JWT_SECRET         = "super-secret-jwt-signing-key"               # hardcoded secret
    }
  }
  # NO tags
  # NO reserved_concurrency — no throttling protection
  # NO X-Ray tracing
}
