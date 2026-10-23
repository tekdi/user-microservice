FROM node:22.23.4-alpine as dependencies
WORKDIR usr/src/app
COPY package*.json  ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
