require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    STUN_SERVERS: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
    ]
};
