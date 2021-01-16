require('dotenv').config()
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-findorcreate');

// AWS S3
const multer = require('multer');
const aws = require('aws-sdk');
const multerS3 = require('multer-s3');

const app = express();

app.use(express.static("public"));

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false
}))

// add Favicon
//import packages, using favicon
var favicon = require('serve-favicon'), path = require("path");
app.use(favicon(path.join(__dirname+'/favicon.ico')));

app.use(passport.initialize());

app.use(passport.session());

mongoose.connect("mongodb+srv://admin-mingwu:test07365273@cluster0.hqelv.mongodb.net/userDB", { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);

const userSchema = new mongoose.Schema({
  account: String,
  email: String,
  password: String,
  googleId: String,
  secret: [
    {
      singleSecret: String,
      picture: String,
      comments: [
        {
          signleComment: String,
          commenter: String,
          commentTime: String
        }
      ]
    }
  ]
});

userSchema.plugin(passportLocalMongoose);

userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

// -------------------------------- multer-s3 upload file to AWS S3------------------------------
aws.config.update({
    secretAccessKey: process.env.AWS_SECRET_ACESS_KEY,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    region: 'us-east-1'
});

const  s3 = new aws.S3();

const upload = multer({
  storage: multerS3({
      s3: s3,
      acl: 'public-read',
      bucket: 'scret-app-of-james-project',
      key: function (req, file, cb) {
          // console.log(file);
          cb(null, file.fieldname + '-' + Date.now() + '.jpg');
      }
  })
});

app.get("/", function (req, res) {
  res.render("index")
})

app.get("/signin", function (req, res) {
  if (req.isAuthenticated()) {
    res.redirect("secrets")
  } else {
    res.render("signin")
  }
})

app.get("/signup", function (req, res) {
  if (req.isAuthenticated()) {
    res.redirect("secrets")
  } else {
    res.render("signup")
  }
})

app.get("/signout", function (req, res) {
  req.logout();
  res.redirect("/signin");
})

app.get("/profile", function(req, res){
  if (req.isAuthenticated()) {
    res.render("profile", {user: req.user});
  } else {
    res.render("signin")
  }
})

app.post("/signup", function (req, res) {

  const account = req.body.account;
  const email = req.body.username;
  const password = req.body.password;
  User.register({ account: account, username: email, active: false }, password, function (err, user) {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/secrets");
      })
    };
  });
});

app.get("/secrets", function (req, res) {
  User.find({ "secret": { $gt: [] } }, function (err, foundUsers) {
    if (err) {
      console.log(err);
    } else {
      if (foundUsers) {
        if (req.isAuthenticated()) {
          res.render("secrets", { usersWithSecrets: foundUsers, flag: "true" });
        } else {
          res.render("secrets", { usersWithSecrets: foundUsers, flag: "false" });
        }
      }
    }
  });
});

app.get("/mysecrets", function (req, res) {
  if (req.isAuthenticated()) {
    User.findById(req.user.id, function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        if (foundUser) {
          res.render("mysecrets", { user: foundUser });
        }
      }
    })
  } else {
    res.render("signin")
  }
});

app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/signin");
  }
})

app.post("/submit", function (req, res) {
  const submittedSecret = {
    singleSecret: req.body.secret,
    // here we need to go to AWS S3 to get the picture back
    picture: req.body.filename
  }
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.secret.push(submittedSecret);
        foundUser.save(function () {
          res.redirect("mysecrets")
        })
      }
    }
  })
})

app.post("/signin", function (req, res) {

  const user = new User({
    username: req.body.username,
    password: req.body.password
  })
  req.login(user, function (err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local", {failureRedirect: '/signin'})(req, res, function () {
        res.redirect("/secrets");
      })
    }
  })
})

app.post("/delete", function (req, res) {
  const postID = req.body.postID;
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        const newSecret = foundUser.secret.filter(function (e) {
          return e.id != postID;
        });
        foundUser.secret = newSecret;
        foundUser.save(function () {
          res.redirect("/mysecrets");
        })
      }
    }
  })
});

app.post("/modify", function (req, res) {
  const postID = req.body.postID;
  const postContent = req.body.postContent;
  const postPicture = req.body.picture;
  res.render("update", { postID: postID, postContent: postContent, postPicture: postPicture });
});

app.post("/update", function (req, res) {

  const newPost = {
    id: req.body.postID,
    singleSecret: req.body.newSecret,
    picture: req.body.postPicture
  }

  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        const modifyPost = foundUser.secret.filter(function (e) {
          return e.id != req.body.postID;
        });
        modifyPost.push(newPost);
        foundUser.secret = modifyPost;
        foundUser.save(function () {
          res.redirect("/mysecrets");
        })
      };
    };
  });
})

app.post("/comment", function (req, res) {

  if (req.isAuthenticated()) {
    User.findById(req.body.userID, function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        if (foundUser) {
          const post = foundUser.secret.filter(function (e) {
            return e.id === req.body.postID;
          });
          currentCmts = post[0].comments;
          res.render("show", { userID: req.body.userID, postID: req.body.postID, postPicture: req.body.picture, currentCmts: currentCmts, sct: post[0].singleSecret });
        };
      };
    });
  } else {
    res.redirect("/signin");
  }
})

app.post("/addComment", function (req, res) {

  if (req.isAuthenticated()) {
    User.findById(req.body.userID, function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        if (foundUser) {
          const post = foundUser.secret.filter(function (e) {
            return e.id === req.body.postID;
          });
          var currentComments = post[0].comments;
          var thisComment = {
            signleComment: req.body.comment,
            commenter: req.user.username,
            commentTime: new Date().toLocaleString()
          }
          currentComments.push(thisComment);
          foundUser.save(function () {
            res.render("show", { userID: req.body.userID, postID: req.body.postID, postPicture: req.body.postPicture, sct: req.body.sct, currentCmts: currentComments});
          })
        };
      };
    });
  } else {
    res.redirect("/signin");
  }
})

app.post('/upload', upload.array('photo',1), function (req, res, next) {

  // res.send("Uploaded!");
  const s3filename = req.files[0].location;
  // console.log(req.files[0].location);

  res.render("submit", {filename: s3filename});
});

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
app.listen(port);
