import request from "request";
import watch from "watch";
import mime  from "mime-types";
import imageSize from "image-size";
import fs from "fs";
import FormData from  "form-data";

// Watson Work Services URL
const watsonWork = "https://api.watsonwork.ibm.com";

// Application Id, obtained from registering the application at https://developer.watsonwork.ibm.com
const appId = process.env.FILESYNC_CLIENT_ID;

// Application secret. Obtained from registration of application.
const appSecret = process.env.FILESYNC_CLIENT_SECRET;

const folder = '<DIRECTORY_TO_WATCH>';
const SPACE_ID = '<SPACE_ID>';

// Optional: To post files as yourself.
const USER_JWT = process.env.USER_JWT;

// Authenticate Application
const authenticateApp = (callback) => {

  if(USER_JWT) {
    return callback(USER_JWT);
  }

  // Authentication API
  const authenticationAPI = 'oauth/token';

  const authenticationOptions = {
    "method": "POST",
    "url": `${watsonWork}/${authenticationAPI}`,
    "auth": {
      "user": appId,
      "pass": appSecret
    },
    "form": {
      "grant_type": "client_credentials"
    }
  };

  request(authenticationOptions, (err, response, body) => {
    // If can't authenticate just return
    if (response.statusCode != 200) {
      console.log("Error authentication application. Exiting.");
      process.exit(1);
    }
    callback(JSON.parse(body).access_token);
  });
};

// Send message to Watson Workspace
const sendMessage = (spaceId, fileId, fileName, fileSize) => {

  // Spaces API
  const spacesAPI = `v1/spaces/${spaceId}/messages`;
  const shortName = fileName.replace(folder, '');
  const mimeType = mime.lookup(shortName);
  let dimensions = { height: 0, width: 0 };
  if (mimeType.indexOf('image') > -1) {
    dimensions = imageSize(fileName);
  }

  // Format for sending messages to Workspace
  const messageData = {
    type: "appMessage",
    version: 1.0,
    annotations: [
      {
        type: "generic",
        version: 1,
        text: "<\$file|"+fileId+"|"+shortName+">"
      },
      {
        type: 'file',
        contentType: mimeType,
        fileId: fileId,
        name: shortName,
        version: 1.0,
        size: fileSize,
        height: dimensions.height,
        width: dimensions.width
      }
    ]
  };
  console.log(messageData);

  // Authenticate application and send message.
  authenticateApp( (jwt) => {

    const sendMessageOptions = {
      "method": "POST",
      "url": `${watsonWork}/${spacesAPI}`,
      "headers": {
        "Authorization": `Bearer ${jwt}`
      },
      "json": messageData
    };

    request(sendMessageOptions, (err, response, body) => {
      if(response.statusCode != 201) {
        console.log("Error posting newrelic information.");
        console.log(response.statusCode);
        console.log(err);
      }
    });
  });
};

const uploadFile = (spaceId, fileName, fileSize) => {
  const filesAPI = '/files/api/v1/files/file/';
  const shortName = fileName.replace(folder, '');
  const attributes = JSON.stringify({"name":shortName,"space":spaceId});
  var form = new FormData();
  form.append('file', fs.createReadStream(fileName));
  form.append('attributes', attributes, {contentType: 'application/json'});

  authenticateApp( (jwt) => {
    form.submit({
      protocol: 'https:',
      host: 'api.watsonwork.ibm.com',
      path: `${filesAPI}`,
      headers: {'Authorization': `Bearer ${jwt}`}
    }, function(err, res) {
      if(err) {
        console.log('Error sending File:', err);
      }else {
        res.on('data', (body) => {
          console.log(`BODY: ${body}`);
          sendMessage(spaceId, JSON.parse(body).entries[0].id, fileName, fileSize);
          const index = pending.indexOf(fileName);
          if (index  != -1) {
            pending.splice(index, 1);
          }
        });
      }

    });
  });
}

const pending = [];

watch.watchTree(folder, function (f, curr, prev) {
  if (typeof f == "object" && prev === null && curr === null) {
    console.log('Finished Walking Tree. Watching all folders');
  } else if (prev === null) {
    if(pending.indexOf(f) == -1) {
      pending.push(f);
      console.log('File Created:', f, curr, prev);
      uploadFile(SPACE_ID, f, curr.size);
    }
  } else if (curr.nlink === 0) {
    console.log('File Removed:', f, curr, prev);
  } else {
    console.log('File Changed:', f, curr, prev);
  }
})
