import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const processes = [
  spawn('node', ['--watch', 'server/api-server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || '8080' },
  }),
  spawn(npmCommand, ['run', 'dev:client'], {
    stdio: 'inherit',
    env: { ...process.env },
  }),
]

const stopAll = (signal = 'SIGTERM') => {
  for (const child of processes) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stopAll()
      process.exit(code)
    }
  })
}

process.on('SIGINT', () => {
  stopAll('SIGINT')
  process.exit(130)
})

process.on('SIGTERM', () => {
  stopAll('SIGTERM')
  process.exit(143)
})