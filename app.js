const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./config/database');
const axios = require('axios');
const Sentiment = require('sentiment');
const sentiment = new Sentiment();
require('dotenv').config();
const app = express();
const path = require('path');
const bcrypt = require('bcrypt');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.set('view engine', 'ejs');

app.get('/index', (req, res) => {
    res.render('index'); //to redirect to home page 
});


connection.query(`
    CREATE TABLE IF NOT EXISTS analysis_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        video_id VARCHAR(255) NOT NULL UNIQUE,
        positive INT DEFAULT 0,
        negative INT DEFAULT 0,
        neutral INT DEFAULT 0,
        channel_name VARCHAR(255)
    );
`);

// Create users table
connection.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL
    );
`);

// Create contact_messages table
connection.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`);


app.get('/', (req, res) => {
    res.render('index');
});
app.post('/analyze', async (req, res) => {
    const videoUrl = req.body.videoUrl;
    const videoId = extractVideoId(videoUrl);
    const comments = await fetchComments(videoId);

    let positive = 0, negative = 0, neutral = 0;
    comments.forEach(comment => {
        const result = sentiment.analyze(comment);
        if (result.score > 0) positive++;
        else if (result.score < 0) negative++;
        else neutral++;
    });

    const totalComments = positive + negative + neutral;

    // Calculate percentages
    const positivePercentage = totalComments > 0 ? ((positive / totalComments) * 100).toFixed(2) : 0;
    const negativePercentage = totalComments > 0 ? ((negative / totalComments) * 100).toFixed(2) : 0;
    const neutralPercentage = totalComments > 0 ? ((neutral / totalComments) * 100).toFixed(2) : 0;

    console.log('Positive:', positivePercentage);
    console.log('Negative:', negativePercentage);
    console.log('Neutral:', neutralPercentage);
    
    const channelName = await fetchChannelName(videoId);

    // Calculate engagement rate
    const engagementRate = totalComments > 0 ? (((positive-negative)+(neutral/2)) / totalComments * 100).toFixed(2) : 0;
    connection.query('INSERT INTO analysis_results (video_id, positive, negative, neutral, channel_name) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE positive=?, negative=?, neutral=?, channel_name=?',
        [videoId, positive, negative, neutral, channelName, positive, negative, neutral, channelName],
        (err) => {
            if (err) throw err;

            // Render results and pass the percentages
            res.render('results', {
                positivePercentage,
                negativePercentage,
                neutralPercentage,
                channelName,
                engagementRate
            });
        }
    );
});



app.get('/register', (req, res) => {
    res.render('register', { greeting: null });
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Check if user already exists
    connection.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error(err);
            return res.render('register', { greeting: 'Error occurred while checking user!' });
        }

        if (results.length > 0) {
            // User already registered
            return res.render('register', { greeting: 'You have already registered! 🎉' });
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);
            connection.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
                [username, email, hashedPassword], (err) => {
                    if (err) {
                        console.error(err);
                        return res.render('register', { greeting: 'Error occurred while registering!' });
                    }
                    res.render('register', { greeting: `Welcome, ${username}! 🎉` });
                }
            );
        }
    });
});



// Contact route
app.get('/contact', (req, res) => {
    const success = req.query.success === 'true'; 
    res.render('contact', { success });
});

app.post('/contact', (req, res) => {
    const { name, email, subject, message } = req.body;

    // Store contact message in the database
    connection.query('INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
        [name, email, subject, message],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error saving message');
            }
            // Redirect to the contact page with a success query param
            res.redirect('/contact?success=true');
        }
    );
});



// Helper functions
function extractVideoId(url) {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v');
}

async function fetchComments(videoId) {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/commentThreads`, {
        params: {
            part: 'snippet',
            videoId: videoId,
            key: 'AIzaSyCmmYiQOkuOQpQyjsSOX9_8nJqy9dnggow'
        }
    });
    return response.data.items.map(item => item.snippet.topLevelComment.snippet.textDisplay);
}


async function fetchChannelName(videoId) {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
        params: {
            part: 'snippet',
            id: videoId,
            key: 'AIzaSyCmmYiQOkuOQpQyjsSOX9_8nJqy9dnggow'
        }
    });
    return response.data.items[0].snippet.channelTitle;
}


// Start the server
const PORT = process.env.PORT || 3044;
app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});
