'use strict';

require('dotenv').config();

const debug = process.env.DEBUG;
if (!debug && process.env.NEWRELIC_KEY) require('newrelic');

const express = require('express');
const request = require('request');
const pug = require('pug');
const bodyparser = require('body-parser');
const pg = require('pg');

const port = process.env.PORT;
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const sentry_dsn = process.env.SENTRY_DSN;

let host = 'https://paywithastar.herokuapp.com';
if (debug) host = 'http://localhost:' + port;

const raven = require('raven');
const logger = new raven.Client(sentry_dsn);

const app = express();
app.set('view engine', 'pug');
app.use(express.static('static'));
app.use(bodyparser.urlencoded());

const mixpanel_token = process.env.MIXPANEL_TOKEN;
app.locals.mixpanel_token = mixpanel_token;

/* Server started */
app.listen(port, () => {
  logger.captureMessage('Server started', {level: 'info'});
});

let database;
pg.defaults.ssl = true;
pg.connect(process.env.DATABASE_URL, (err, client) => {
    if (err) throw err;
    database = client;
});

/* Using code to get access token
 *
 * code = access code
 * params = {author, repo}
 * callback = callback function (starRepo)
 * res = express response object
 *
 */

let getAccessToken = (code, hash, callback, res) => {
    let options = {
        url:'https://github.com/login/oauth/access_token',
        headers: {
              'Accept': 'application/json'
        },
        form: {
            client_id,
            client_secret,
            code,
            scope: 'public_repo'
        }
    };
    request.post(options, (err, httpResponse, body) => {
        logger.captureMessage('Oath', {level: 'debug', extra: body});
        let access_token = JSON.parse(body).access_token;
        callback(access_token, hash, res);
    });
};

let getDataFromHash = (hash, callback) => {
    let query = "SELECT * from links where hash = '" + hash + "'";
    logger.captureMessage('Query', {level: 'info', extra: query});
    database.query(query, (err, result) => {
        if (err) throw err;
        let redirect_url;
        let repo;
        if (result.rows.length) {
            repo = result.rows[0].repo;
            redirect_url = result.rows[0].redirection;
        } else {
            redirect_url = host;
        }
        callback({repo, redirect_url});
    });
};

/* Star repo
 *
 * token = github access token
 * hash = identifier
 * res = express response object
 *
 */

let starRepo = (token, hash, res) => {
    getDataFromHash(hash, (data) => {
        let url = 'https://api.github.com/user/starred/';
        url += data.repo;
        url += '?access_token=' + token;

        let options = {
            url: url,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'pay-with-a-star'
            }
        };

        request.put(options, (err, response, body) => {
            res.redirect('/done?redirect_url=' + data.redirect_url);
        });
    });
};

let authorizeEndPoint = 'https://github.com/login/oauth/authorize?';
authorizeEndPoint += 'client_id=' + client_id;
authorizeEndPoint += '&scope=public_repo';
authorizeEndPoint += '&redirect_uri=';
authorizeEndPoint += host + '/r/';

/* s - entry point */

app.get('/s/:hash', (req, res) => {
    let hash = req.params.hash;
    res.redirect(authorizeEndPoint + hash) // redirect to authorize end point
});

/* r - return url */

app.get('/r/:hash', (req, res) => {
    let code = req.query.code;
    let hash = req.params.hash;
    getAccessToken(code, hash, starRepo, res);
});

/* Page before redirecting */

app.get('/done', (req, res) => {
    res.render('done');
});

/* New link page */

app.get('/new', (req, res) => {
    res.render('new');
});

/* Generate links */

let generateLink = (data, callback) => {
    let length = 6;
    let hash = (Math.random().toString(36)+'00000000000000000').slice(2, length +2);
    let link = host + '/s/' + hash;

    let repo = data.author + '/' + data.repo;

    let values = "'" + hash + "','" + repo + "','" + data.redirection + "', now()";

    //let query = 'CREATE TABLE links (hash varchar(20), repo varchar(200), redirection varchar(200), created_on date)';

    let query = "INSERT INTO links (hash, repo, redirection, created_on) values (" + values + ")";
    logger.captureMessage('Query', {level: 'info', extra: query});

    database.query(query, (err, result) => {
        if (err) throw err;
        callback(link);
    });
};

app.post('/generate', (req, res) => {
    let data = req.body;
    generateLink(data, (link) => {
        res.render('generate', {link});
    });
});

/* Home page */

app.get('/', (req, res) => {
    res.render('hi');
});

/* Status end point */

app.get('/status', (req, res) => {
    res.end('Alive');
});

