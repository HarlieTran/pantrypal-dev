variable "aws_region" {
  default = "us-east-2"
}

variable "frontend_origin" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "spoonacular_api_key" {
  type      = string
  sensitive = true
}

variable "unsplash_access_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "bedrock_model_id" {
  default = "amazon.nova-lite-v1:0"
}
