const bcrypt = require('bcrypt');  //sifrelemek icin bcrypt kutuphanesi
const jwt = require('jsonwebtoken');

const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2b$10$abcdefg', // hashlanmis sifresi
        email: 'admin@example.com'
    }
];

// sifrelerini hashlamak icin kullanilan fonksiyon
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

// userlerini dogrulamak icin kullanilan fonskiyon
async function authenticateUser(username, password) {
    const user = users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user.id, username: user.username }, 'your_jwt_secret', { expiresIn: '1h' });
        return { user, token };
    } else {
        throw new Error('Invalid credentials');
    }
}

// tokenleri dogrulamak icin middleware fonskiyonu tanimlamak
function verifyToken(req, res, next) {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Access denied' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const verified = jwt.verify(token, 'your_jwt_secret');
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ success: false, error: 'Invalid token' });
    }
}

module.exports = { authenticateUser, verifyToken, hashPassword };
