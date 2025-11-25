module.exports = {
  apps: [
    {
      name: 'ssh-panel-next',
      script: 'npm',
      args: 'start',
      cwd: '/path/to/your/project',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'ssh-panel-websocket',
      script: 'npx',
      args: 'tsx src/lib/websocket-server.ts',
      cwd: '/path/to/your/project',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 8443
      }
    }
  ]
};