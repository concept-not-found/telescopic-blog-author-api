var express = require('express');
var bodyParser = require("body-parser");
var redis = require('redis');
var PileClient = require('piledb');

var redisHost = process.env.REDIS_URL || undefined;
var port = process.env.PORT || 6000;

var application = express();
application.use(bodyParser.json());

var redisClient = redis.createClient(redisHost);
var database = new PileClient(redisClient, 'blog');

application.post('/publish', function (request, response) {
  if (!request.is('application/json')) {
    return response.status(400).send('expected json body');
  }
  var article = request.body;
  redisClient.INCR('blog:article-id', function(err, articleId) {
    if (err) {
      return response.status(500).send(err);
    }
    var articleKey = 'article:' + articleId;
    var articleDataKey = articleKey + ':' + new Date().getTime();
    database.putData(articleDataKey, JSON.stringify(article), function(err) {
      if (err) {
        return response.status(500).send(err);
      }
      database.addReference(articleKey, articleDataKey, function(err) {
        if (err) {
          return response.status(500).send(err);
        }
        database.getLastReference('blog', function(err, blogKey) {
          function appendArticleKey(articles) {
            articles.push(articleDataKey);
            var blogKey = 'blog';
            var blogDataKey = blogKey + ':' + new Date().getTime();
            database.putData(blogDataKey, JSON.stringify(articles), function(err) {
              if (err) {
                return response.status(500).send(err);
              }
              database.addReference(blogKey, blogDataKey, function(err) {
                if (err) {
                  return response.status(500).send(err);
                }
                return response.status(201).send('created ' + articleDataKey);
              });
            });
          }
          if (err) {
            if (err instanceof PileClient.NotFoundError) {
              return appendArticleKey([]);
            } else {
              return response.status(500).send(err);
            }
          }
          database.getData(blogKey, function(err, articles) {
            if (err) {
              return response.status(500).send(err);
            }
            return appendArticleKey(JSON.parse(articles));
          });
        });
      });
    });
  });
});

application.listen(port);
