#!/bin/bash

# Create the FastMath2 DynamoDB table with the necessary structure

echo "Creating FastMath2 DynamoDB table..."

aws dynamodb create-table \
  --table-name FastMath2 \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "email-index",
        "KeySchema": [
          {"AttributeName": "email", "KeyType": "HASH"}
        ],
        "Projection": {
          "ProjectionType": "ALL"
        },
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 5,
          "WriteCapacityUnits": 5
        }
      }
    ]' \
  --provisioned-throughput \
    ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region us-east-1

echo "Waiting for table to be created..."
aws dynamodb wait table-exists --table-name FastMath2 --region us-east-1

echo "FastMath2 table created successfully!"
echo ""
echo "Table structure:"
echo "- Primary Key: PK (Partition Key), SK (Sort Key)"
echo "- Global Secondary Index: email-index (for user lookups by email)"
echo ""
echo "You can now run the backend server!"