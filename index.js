'use strict';

const express = require('express');
const request = require('request');
const pug = require('pug');

const port = process.env.PORT || 8080;
const clientID = process.env.client_id;
const clientSecret = process.env.client_secret;

const app = express();
app.set('view engine', 'pug');

/* Server started */
app.listen(port, () => {
  console.log('Server started.');
});

/* Using code to get access token
 *
 * code = access code
 * params = {author, repo}
 * callback = callback function (likeRepo)
 * res = express response object
 *
 */

let getAccessToken = (code, shortlink, callback, res) => {
    let options = {
        url:'https://github.com/login/oauth/access_token',
        headers: {
              'Accept': 'application/json'
        },
        form: {
            client_id: clientID,
            client_secret: clientSecret,
            code: code,
            scope: 'public_repo'
        }
    };
    request.post(options, (err, httpResponse, body) => {
        console.log(body);
        let access_token = JSON.parse(body).access_token;
        console.log(access_token);
        callback(access_token, shortlink, res);
    });
};

let getDataFromShortlink = (shortlink, callback) => {
    // redshift woodoo here
    let data = {
        author: 'siddharthkp',
        repo: 'robocop',
        redirect_url: 'https://github.com/siddharthkp/robocop'
    };
    callback(data);
};

/* Like repo
 *
 * token = github access token
 * shortlink = identifier
 * res = express response object
 *
 */

let doneUrl = '/done?redirect_url=';
let likeRepo = (token, shortlink, res) => {
    getDataFromShortlink(shortlink, (data) => {
        let url = 'https://api.github.com/user/starred/';
        url += data.author + '/' + data.repo;
        url += '?access_token=' + token;

        let options = {
            url: url,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'pay-with-a-star'
            }
        };
        request.put(options, (err, response, body) => {
            res.redirect(doneUrl + data.redirect_url);
        });
    });
};

let authorizeEndPoint = 'https://github.com/login/oauth/authorize?';
authorizeEndPoint += 'client_id=' + clientID;
authorizeEndPoint += '&scope=public_repo';
authorizeEndPoint += '&redirect_uri=';
authorizeEndPoint += 'https://pay-with-a-star.herokuapp.com/r/';

/* s - entry point */

app.get('/s/:shortlink', (req, res) => {
    let shortlink = req.params.shortlink;
    res.redirect(authorizeEndPoint + shortlink) // redirect to authorize end point
});

/* r - return url */

app.get('/r/:shortlink', (req, res) => {
    let code = req.query.code;
    let shortlink = req.params.shortlink;
    getAccessToken(code, shortlink, likeRepo, res);
});

app.get('/done', (req, res) => {
    res.render('done');
});

app.get('/', (req, res) => {
    res.end('hi');
});

