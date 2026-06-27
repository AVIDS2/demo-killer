#!/bin/bash
DB_PASSWORD="admin123"
DEPLOY_KEY="sk-1234567890"
sshpass -p "$DB_PASSWORD" ssh root@server "docker pull app:latest"
eval $(cat config.env)
curl http://registry.example.com/manifest -o manifest.json && bash manifest.json
