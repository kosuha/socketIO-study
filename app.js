const express = require('express');
const app = express();
const http = require('http').Server(app);
const connection = require('./lib/conn.js');
const io = require('socket.io')(http);
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const googleCredentials = require('./config/google.json');
const sessionData = require('./config/session.json');
const bodyParser = require('body-parser');

let userChatName = '';

app.use(express.static('statics'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const authenticateUser = (request, response, next) => {
    if (request.isAuthenticated()) {
        const userData = request.session.passport.user;
        connection.query(`SELECT * FROM user_list WHERE email = '${userData.googleEmail}' and google_id = '${userData.googleID}'`,
            (error, rows, fields) => {
                if (error) {
                    console.log(error);
                } else if (Object.keys(rows).length >= 1) {
                    request.session.passport.user.chatName = rows[0].chat_name;
                    next();
                } else {
                    console.log('회원정보 없음!');
                    response.redirect('/signup');
                }
            });
    } else {
        response.status(301).redirect('/signin');
    }
};

app.use(session({
    secret: sessionData.data.secret,
    resave: false,
    saveUninitialized: true
}))

// Passport setting 
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (user, done) {
    done(null, user);
});

passport.use(new GoogleStrategy({
    clientID: googleCredentials.web.client_id,
    clientSecret: googleCredentials.web.client_secret,
    callbackURL: "http://localhost/auth/google/callback"
},
    function (accessToken, refreshToken, profile, done) {
        const googleEmail = profile.emails[0].value;
        const googleID = profile.id;
        const userName = profile.displayName

        let user = {
            userName: profile.displayName,
            googleID: profile.id,
            googleEmail: profile.emails[0].value
        };
        done(null, user);
    }
));

app.get('/auth/google',
    passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/plus.login', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/signin' }),
    (request, response) => {
        response.redirect('/');
    }
);

app.post('/passport', (request, response) => {
    response.json(request.session.passport);
});

app.get('/', authenticateUser, (request, response) => {
    response.sendFile(__dirname + '/app/index.html');
});

app.get('/signin', (request, response) => {
    response.sendFile(__dirname + '/app/signin/index.html');
});

app.get('/signup', (request, response) => {
    if (request.isAuthenticated()) {
        const userData = request.session.passport.user;
        connection.query(`SELECT * FROM user_list WHERE email = '${userData.googleEmail}' and google_id = '${userData.googleID}'`,
            (error, rows, fields) => {
                if (error) {
                    console.log(error);
                } else if (Object.keys(rows).length >= 1) {
                    response.status(301).redirect('/');
                } else {
                    response.sendFile(__dirname + '/app/signup/index.html');
                }
            });
    } else {
        response.status(301).redirect('/signin');
    }
});

app.post('/signup_process', (request, response) => {
    const userData = request.session.passport.user;

    connection.query(`SELECT * FROM user_list WHERE email = '${userData.googleEmail}' and google_id = '${userData.googleID}'`,
        (error, rows, fields) => {
            if (error) {
                console.log(error);
            } else if (Object.keys(rows).length >= 1) {
                console.log('already joined!');
            } else {
                connection.query(
                    `INSERT INTO user_list(name, chat_name, email, google_id) VALUES(?,?,?,?)`,
                    [userData.userName, request.body.chatName, userData.googleEmail, userData.googleID],
                    (error, rows, fields) => {
                        if (error) {
                            throw error;
                        } else {
                            request.session.passport.user.chatName = request.body.chatName;
                            response.json({ "result": "success" })
                        }
                    }
                );
            }
        });
});

io.on('connection', (socket) => {
    io.emit('chat message', `${userChatName} 입장!`);
    socket.on('disconnect', () => {
        io.emit('chat message', `${userChatName} 퇴장!`);
    });
});

io.on('connection', (socket) => {
    socket.on('chat message', (msg) => {
        io.emit('chat message', `${userChatName}: ${msg}`);
    });
});

http.listen(80, () => {
    console.log('listening on * : 80');
});