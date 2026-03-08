FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine
# Copy built files to nginx
COPY --from=builder /app/build /usr/share/nginx/html
# Setup routing for SPA
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
