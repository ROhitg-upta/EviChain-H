module.exports = {
  apps: [
    {
      name: "evichain-api",
      cwd: "./server",
      script: "dist/index.js",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "2s",
      restart_delay: 2000,
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: 4000
      }
    }
  ]
};
