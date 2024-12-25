const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',       // Your database host
    user: 'root',   // Your database username
    password: 'root', // Your database password
    database: 'youtube_comments_analyzer2' // Your database name
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        return;
    }
    console.log('Database connected successfully');
});

module.exports = db;