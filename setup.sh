#!/bin/bash

echo "🚀 Starting Pratham Docker Setup..."

# Clone the user-service if not already cloned
if [ ! -d "user-service" ]; then
  echo "📥 Cloning user-microservice..."
  git clone git@github.com:tekdi/user-microservice.git user-service
fi

# Generate .env if not exists
if [ ! -f ".env" ]; then
  echo "🔐 Creating .env file..."
  cat <<EOT >> .env
POSTGRES_USER=prathamuser
POSTGRES_PASSWORD=prathampass
POSTGRES_DB=prathamdb
PGADMIN_EMAIL=admin@pratham.com
PGADMIN_PASSWORD=admin
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
EOT
else
  echo "✅ .env file already exists, skipping..."
fi

# Build and Start Containers
echo "🐳 Spinning up Docker containers..."
docker-compose up --build -d

echo "✅ All services are running:"
echo "- Node Service: http://localhost:3000"
echo "- PGAdmin: http://localhost:5050 (admin@pratham.com / admin)"
echo "- Keycloak: http://localhost:8080 (admin / admin)"
