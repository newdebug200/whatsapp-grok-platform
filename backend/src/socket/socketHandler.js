module.exports = (io, prisma) => {
  io.on('connection', (socket) => {
    console.log('Client connecté:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client déconnecté:', socket.id);
    });

    socket.on('get-initial-data', async () => {
      try {
        const users = await prisma.user.findMany({
          include: {
            messages: {
              orderBy: { created_at: 'desc' },
              take: 1
            }
          },
          orderBy: { created_at: 'desc' }
        });
        
        socket.emit('initial-users', users);
      } catch (error) {
        console.error('Erreur récupération données:', error);
      }
    });
  });
};