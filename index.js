var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var execSync = require('exec-sync');
var session = require('express-session');
var http = require('http');
var _ = require("underscore");
var exec = require('child_process').exec;
var MongoClient = require('mongodb').MongoClient;
var favicon = require('serve-favicon');
//var dns = require('dns');

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.set('view engine', 'jade'); // use jade as a template engine
app.use(express.static(__dirname)); // set the static folder location
app.use(favicon('/home/jdonas/web-interface/template/static/img/favicon.png')); // serves favicon

// session to keep track of errors to be displayed
app.use(session({ secret: 'rand0m5tr1ng', resave: false, saveUninitialized: false}));


////////////////////////////////////////////


app.get('/', function (req, res) {
    res.render("/home/jdonas/web-interface/template/views/ip-home");
});


////////////////////////////////////////////


app.get('/cases', function (req, res) {
        res.render("/home/jdonas/web-interface/template/views/cases");
});


////////////////////////////////////////////


app.get('/forensic-cases', function (req, res) {
    var url = "mongodb://jdonas:NCIR4525@192.168.0.113/paladion-cases";
    MongoClient.connect(url, function(err, db) {
        var collection = db.collection('cases');
        collection.find({}).toArray(function(err, docs) {
            res.render("/home/jdonas/web-interface/components/scan-interface/views/index", { cases : JSON.parse(JSON.stringify(docs)) });
        db.close();
        });
    });
});


////////////////////////////////////////////


app.get('/cases/:case', function (req, res) {
    var search = 
      [{"nsrl": true}, {"nsrl": false}, {"nsrl": null}, {"virustotalpercentage": null}, 
       {"virustotalpercentage": 0}, {"virustotalpercentage": {"$gt": 0}},
       {"virustotalpercentage": {"$gt": 10}}, {"clamavmalware": null}, 
       {"clamavmalware": true}, {"clamavmalware": false}, {"wildfiremalware": null},
       {"wildfiremalware": true}, {"wildfiremalware": false}, {}];
    var results = [];
    var finished = _.after(1, doRender);

    console.log(search); 
    // connects to mongo
    var case_name = req.params.case;
    var url = "mongodb://jdonas:NCIR4525@192.168.0.113/" + case_name +"?authSource=admin";
    MongoClient.connect(url, function(err, db) {
        var finInfo = _.after(search.length, doClose);
        var collection = db.collection('files');

        search.forEach(function (value, i) {
            collection.count(value, function (err, num) {
                results.push({index: i, result: num});
                finInfo();
            });
        });

        function doClose() {
            db.close();
            finished();
        }
    });

    // used to sort the results list
    function compare(a, b) {
      if (a.index < b.index)
        return -1;
      else (a.index > b.index)
        return 1;
    }
    
    // renders page
    function doRender() {
        console.log(results);
        console.log("******************");
        results.sort(compare);
        console.log(results);
        var left = results[2].result + results[3].result + results[7].result + results[10].result;
        var tot = (results[13].result*4);
        console.log(tot+" *** "+left)
        var percent = Math.round(((tot - left)/tot)*100);
        console.log("Percent: " + percent);
 
        var progress;
        if (percent == 100)
            progress = "progress-bar-success";
        else
            progress = "progress-bar-striped active";

        res.render("/home/jdonas/web-interface/components/scan-interface/views/results", 
          { percent: percent, progress: progress, tot_files: tot,
            vtotal_null: , vtotal_0: , vtotal_gt0: , vtotal_gt10: ,
            nsrl_null: , nsrl_true: , nsrl_false: ,
            clamav_null: , clamav_true: , clamav_false: ,
            wfire_null: , wfire_true: , wfire_false: });
    }

});


////////////////////////////////////////////


app.get('/ip-check', function (req, res) {
  var data = JSON.parse(execSync('/home/jdonas/web-interface/components/ip-checker/scripts/num_ip.py'));
  var count = data["aggregations"]["counts"]["value"];
  // keeps track of entered data when error page is displayed
  if (req.session.error) {
    res.render("/home/jdonas/web-interface/components/ip-checker/views/index", { error: req.session.message, ip: req.session.ip, ip_count: count });
    req.session.destroy();
  }
  else
    res.render("/home/jdonas/web-interface/components/ip-checker/views/index", { error: "", ip: "", ip_count: count });
});


////////////////////////////////////////////


// processes input
app.post('/process', function(req, res) {
  var ip = req.body.ip.replace(/\s/g,'');
  var cache = req.body.query;

  // regex to check ip format
  var ipformat = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  //checks if documents exist
  function ipCheck(ip) {
    var check = JSON.parse(execSync('/home/jdonas/web-interface/components/ip-checker/scripts/ip-check.py ' + ip));
    if (check["exists"])
      return true;
    return false;
  }

  // checks if input is a valid ip
  if (!ip.match(ipformat)) {
    req.session.error = true;
    req.session.ip = ip;
    req.session.message = "Please enter a valid IP address";
    res.redirect('/ip-check');
  }
  //checks if ip has been cached already
  else if (cache == 0 && !ipCheck(ip)) {
    req.session.error = true;
    req.session.ip = ip;
    req.session.message = "IP has not been cached. Please select 'New Query'";
    res.redirect('/ip-check');
  }
  else {

    var finished = _.after(3, doRender);

/*    // resolve ip to hostname
    var iptohost;
    var hosttoip;
    dns.lookupService(ip, 80, function(err, hostname, service) {
      iptohost = hostname;
console.log(iptohost);
      // resolve hostname to ip
      dns.lookup(iptohost, function(err2, address, family) {
        hosttoip = address;
  console.log(hosttoip);
        finished();
      });
    });*/

    // gets ip location
    var url = "http://ipinfo.io/"+ip+"/loc";
    var loc = '';
    http.get(url, function(http_res) {
      http_res.setEncoding('utf8');
      http_res.on("data", function(data) {
        loc += data;
      });
      http_res.on("end", function() {
        finished();
      });
    });

    // runs shell commands
    if (cache == 1) {
      var placeholder = execSync('/home/jdonas/web-interface/components/ip-checker/scripts/gather.sh ' + ip);
    }

    // gets VirusTotal json from elasticsearch
    var vir_stdout;
    exec('/home/jdonas/web-interface/components/ip-checker/scripts/vir-query.py ' + ip, function(error, stdout, stderr) {
      vir_stdout = JSON.parse(stdout);
      finished();
    });

    // gets registrar json from elasticsearch
    var reg_stdout;
    var query_time = 0;
    exec('/home/jdonas/web-interface/components/ip-checker/scripts/reg-query.py ' + ip + ' 0', function(error, stdout, stderr) {
      reg_stdout = JSON.parse(stdout);
      if (reg_stdout["hits"]["total"] > 1) {
        var datetime = reg_stdout["hits"]["hits"][0]["_source"]["datetime"];

        // this allows multiple, most-recent regristar entries to be displayed
        reg_stdout = '';
        exec('/home/jdonas/web-interface/components/ip-checker/scripts/reg-query.py ' + ip + ' 1 "' + datetime + '"', function(error, stdout, stderr) {
          reg_stdout = JSON.parse(stdout);
          query_time = reg_stdout["took"];
          finished();
        });

      }
      else
        finished();
    });

    // VirusTotal statistics helper: gets detection count
    function detCount(arr) {
      var size = arr.length;
      return size.toString();
    }

    // VirusTotal statistics helper: gets detection score
    function detAvg(arr) {
      var size = arr.length;
      var pos = 0;
      var total = 0;
      for (var i = 0; i < size; ++i) {
        pos += arr[i]["positives"];
        total += arr[i]["total"];
      }
      return Math.round((pos/total)*100).toString() + "%";
    }

    // VirusTotal statistics helper: gets score color rating
    function getColor(percent) {
      var per = parseInt(percent);
      if (per >= 50)
        return "red";
      else if (per >= 10)
        return "orange";
      else
        return "limeGreen";
    }

    // registrar statistics helper
    function catNames(arr, ind) {
      var len = arr.length;
      var str = '';
      for (var i = 0; i < len; ++i) {
        if (i == 0)
          str += arr[i]["_source"][ind];
        else if (i == 2) {
          str += ", (more)...";
          break; }
        else
          str += ", " + arr[i]["_source"][ind];
      }
    return str;
    }

    function doRender() {
      query_time += vir_stdout["took"] + reg_stdout["took"];
      // VirusTotal statistics
      var d_comm, d_down, d_urls, resolutions, comm_score, down_score, urls_score;
      d_comm = d_down = d_urls = resolutions = "None";
      comm_score = down_score = urls_score = "N/A";

      var vir_html;
      var colors = ["limeGreen", "black", "limeGreen", "black", "limeGreen", "black", "limeGreen"];

      if (vir_stdout["hits"]["total"] == 0 ||
          !("response_code" in vir_stdout["hits"]["hits"][0]["_source"]) ||
          vir_stdout["hits"]["hits"][0]["_source"]["response_code"] != 1)
        vir_html = '<p style="color:orange; text-align: center;"><i>No VirusTotal info available for ' + ip + '</i></p>';
      else {
        var vir_res = vir_stdout["hits"]["hits"][0]["_source"];
        if ("detected_communicating_samples" in vir_res) {
        d_comm = detCount(vir_res["detected_communicating_samples"]);
          comm_score = detAvg(vir_res["detected_communicating_samples"]);
        colors[0] = getColor(d_comm);
        colors[1] = getColor(comm_score.slice(0, -1));
          if (d_comm == "100")
            d_comm = "100+";
        }
        if ("detected_downloaded_samples" in vir_res) {
          d_down = detCount(vir_res["detected_downloaded_samples"]);
          down_score = detAvg(vir_res["detected_downloaded_samples"]);
          colors[2] = getColor(d_down);
          colors[3] = getColor(down_score.slice(0, -1));
          if (d_down == "100")
            d_down = "100+";
        }
        if ("detected_urls" in vir_res) {
          d_urls = detCount(vir_res["detected_urls"]);
          urls_score = detAvg(vir_res["detected_urls"]);
          colors[4] = getColor(d_urls);
          colors[5] = getColor(urls_score.slice(0, -1));
          if (d_urls == "100")
            d_urls = "100+";
        }
        if ("resolutions" in vir_res) {
          resolutions = detCount(vir_res["resolutions"]);
          colors[6] = getColor(resolutions.slice(0, -1));
          if (resolutions == "1000")
            resolutions = "1000+";
        }

        vir_html = "<img src='components/ip-checker/static/comm.png' height='30'/>" +
               "<p style='text-indent: 30px; margin-bottom: 10px;'><b>Detected Communicating Samples:</b> " + "<span style='color: " + colors[0] + "'>" + d_comm + "</span>" + "</p>" +
             "<p style='text-indent: 100px; font-size: 80%; margin-top: 0px;'><b>AV Detection Rate:</b> " + "<span style='color: " + colors[1] + "'>" + comm_score + "</span>" + "</p>" +
               "<img src='components/ip-checker/static/down.png' height='30'/>" +
               "<p style='text-indent: 30px; margin-bottom: 10px;'><b>Detected Downloaded Samples:</b> " + "<span style='color: " + colors[2] + "'>" + d_down + "</span>" + "</p>" +
               "<p style='text-indent: 100px; font-size: 80%; margin-top: 0px;'><b>AV Detection Rate:</b> " + "<span style='color: " + colors[3] + "'>" + down_score + "</span>" + "</p>" +
               "<img src='components/ip-checker/static/urls.png' height='30'/>" +
               "<p style='text-indent: 30px; margin-bottom: 10px;'><b>Detected URLs:</b> " + "<span style='color: " + colors[4] + "'>" + d_urls + "</span>" + "</p>" +
               "<p style='text-indent: 100px; font-size: 80%; margin-top: 0px;'><b>AV Detection Rate:</b> " + "<span style='color: " + colors[5] + "'>" + urls_score + "</span>" + "</p>" +
               "<img src='components/ip-checker/static/res.png'  height='30'/>" +
             "<p style='text-indent: 30px;'><b>DNS Resolutions:</b> " + "<span style='color: " + colors[6] + "'>" + resolutions + "</span>" + "</p>";
      }

      // registrar statistics
      var reg_html;
      var reg_res = reg_stdout["hits"]["hits"];

      if (reg_stdout["hits"]["total"] == 0) {
        reg_html = '<p style="color:orange; text-align: center;"><i>No registrar info available for ' + ip + '</i></p>';

  }    else {
        var title1 = "Netname:";
        var title2 = "Organization:";
        if (reg_res.length > 1) {
          title1 = "Netnames:"
          title2 = "Organizations:"
        }
        var name1 = catNames(reg_res, "netname");
        var name2 = catNames(reg_res, "organization");

        reg_html = "<div style='display: inline-block; text-align: left; padding: 10px 0px;'><b>" + title1 + "</b> <span style='font-size: 80%;'>" + name1 + "</span><br>" +
                 "<b>" + title2 + "</b> <span style='font-size: 80%;'>" + name2 + "</span></div>";
      }

      res.render("/home/jdonas/web-interface/components/ip-checker/views/results",
        { vir_json: vir_stdout, reg_json: reg_stdout, ip: ip, loc: loc,
          time: query_time, vir_insert: vir_html, reg_insert: reg_html });

    }

  }
});


////////////////////////////////////////////


app.get('/process', function (req, res) {
  res.redirect('/');
});


////////////////////////////////////////////


// handling 404 errors
app.get('*', function(req, res, next) {
  var err = new Error();
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  if(err.status !== 404) {
    return next();
  }
  res.redirect('/');
});


////////////////////////////////////////////


// runs site
app.listen(80);