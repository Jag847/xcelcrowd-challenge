FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY public ./public
COPY src ./src
COPY tailwind.config.js ./ 
COPY postcss.config.js ./

EXPOSE 3000

CMD ["npm", "run", "start"]