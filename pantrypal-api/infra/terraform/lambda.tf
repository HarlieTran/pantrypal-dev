resource "aws_lambda_function" "api" {
  function_name = "pantrypal-api"
  runtime       = "nodejs20.x"
  handler       = "dist/lambda.handler"
  filename      = "dist/lambda.zip"
  memory_size   = 512
  timeout       = 15
  role          = aws_iam_role.lambda_exec.arn

  environment {
    variables = {
      DATABASE_URL           = var.database_url
      COGNITO_REGION         = var.aws_region
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.main.id
      COGNITO_APP_CLIENT_ID  = aws_cognito_user_pool_client.main.id
      AWS_REGION             = var.aws_region
      BEDROCK_MODEL_ID       = var.bedrock_model_id
      PANTRY_IMAGES_BUCKET   = aws_s3_bucket.pantry_uploads.bucket
      S3_BUCKET_RECIPE_CACHE = aws_s3_bucket.recipe_cache.bucket
      SPOONACULAR_API_KEY    = var.spoonacular_api_key
      UNSPLASH_ACCESS_KEY    = var.unsplash_access_key
      FRONTEND_ORIGIN        = var.frontend_origin
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name = "pantrypal-lambda-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.pantry_uploads.arn}/*",
          "${aws_s3_bucket.recipe_cache.arn}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "*"
      }
    ]
  })
}
