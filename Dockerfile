# Stage 1: Install dependencies
FROM node:20 as dependencies
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Stage 2: Build and run
FROM node:20 as runner
WORKDIR /usr/src/app
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
