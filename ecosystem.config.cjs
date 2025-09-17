module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'server-port3000.cjs',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}