module.exports = {
  apps: [
    {
      name: "shorts-maker",
      script: "server/index.js",
      cwd: "/var/www/shorts-maker",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3033,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3033,
      },
      error_file: "/var/log/pm2/shorts-maker-error.log",
      out_file: "/var/log/pm2/shorts-maker-out.log",
      log_file: "/var/log/pm2/shorts-maker-combined.log",
      time: true,
    },
  ],
};
