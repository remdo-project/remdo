import process from 'node:process';

process.on('SIGTERM', () => process.send({ ignored: true }));
setInterval(() => {}, 1000);
process.send({ ready: true });
