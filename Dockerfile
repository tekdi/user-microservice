FROM node:20 as dependencies
WORKDIR usr/src/app
COPY package*.json  ./
RUN npm install
COPY . .
RUN npm run build

# Set default port (can be overridden via environment variable)
# Note: Service runs on port 3002 by default (see main.ts)
ENV PORT=3002
EXPOSE 3002

# Health check for Docker - checks if service and database are ready
# Uses 127.0.0.1 (localhost) which works inside the container
# Port is read from PORT env variable, defaults to 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3002; require('http').get('http://127.0.0.1:' + port + '/health/ready', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

CMD ["npm", "start"]
