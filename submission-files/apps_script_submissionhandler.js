function doPost(e) {
  try {
    // SAFER DEBUG SECTION
    Logger.log("=== DEBUG START ===");
    Logger.log("Event object exists: " + (e ? 'yes' : 'no'));
    
    if (e) {
      Logger.log("postData exists: " + (e.postData ? 'yes' : 'no'));
      if (e.postData) {
        Logger.log("postData type: " + (e.postData.type || 'undefined'));
      }
      Logger.log("parameter exists: " + (e.parameter ? 'yes' : 'no'));
      
      if (e.parameter) {
        Logger.log("parameter keys: " + Object.keys(e.parameter));
        Logger.log("parameter count: " + Object.keys(e.parameter).length);
        
        Object.keys(e.parameter).forEach(key => {
          const param = e.parameter[key];
          Logger.log("Parameter '" + key + "' type: " + typeof param);
          if (param && typeof param.getName === 'function') {
            Logger.log("Parameter '" + key + "' is a blob with name: " + param.getName());
            Logger.log("Parameter '" + key + "' blob size: " + (param.getBytes ? param.getBytes().length : 'unknown'));
          } else if (typeof param === 'string') {
            Logger.log("Parameter '" + key + "' value: " + param);
          }
        });
      }
    }
    Logger.log("=== DEBUG END ===");
    
    let data = {};
    let files = {};
    
    // Safer handling
    if (!e) {
      throw new Error("No event object received");
    }
    
    const postDataType = (e.postData && e.postData.type) ? e.postData.type : '';
    
    if (postDataType && postDataType.includes('application/json')) {
      const jsonData = JSON.parse(e.postData.contents || "{}");
      
      // Check if this is the new format with base64 files
      if (jsonData._files) {
        console.log("Received JSON with base64 files");
        console.log("Files found:", Object.keys(jsonData._files));
        
        // Extract regular form data
        data = { ...jsonData };
        delete data._files;
        
        // Process base64 files
        Object.keys(jsonData._files).forEach(key => {
          const fileInfo = jsonData._files[key];
          console.log("Processing file:", key, "name:", fileInfo.name, "size:", fileInfo.size);
          
          try {
            // Convert base64 back to blob
            const base64Data = fileInfo.base64;
            const binaryString = Utilities.base64Decode(base64Data);
            const blob = Utilities.newBlob(binaryString, fileInfo.type || 'application/octet-stream', fileInfo.name);
            
            // Extract field name from key (remove _0, _1 suffix)
            const fieldName = key.replace(/_\d+$/, '');
            if (!files[fieldName]) {
              files[fieldName] = [];
            }
            
            files[fieldName].push({
              blob: blob,
              name: fileInfo.name,
              size: fileInfo.size
            });
            
            console.log("Successfully processed file:", fileInfo.name, "for field:", fieldName);
          } catch (error) {
            console.log("Error processing file:", key, error.toString());
          }
        });
      } else {
        // Regular JSON data
        data = jsonData;
      }
    } else {
      // Handle multipart form data
      const parameters = e.parameter || {};
      
      console.log("=== APPS SCRIPT DEBUG ===");
      console.log("Parameters received:", Object.keys(parameters));
      console.log("Parameter count:", Object.keys(parameters).length);
      
      // Extract regular form fields
      Object.keys(parameters).forEach(key => {
        // Exclude file-related parameters: _count and file parameters like cv_0, motivation_0
        if (!key.includes('_count') && !key.match(/_\d+$/)) {
          data[key] = parameters[key];
          console.log("Added form field:", key, "=", parameters[key]);
        }
      });
      
      // Extract file information - COMPLETELY REWRITTEN
      console.log("Looking for files in parameters...");
      Object.keys(parameters).forEach(key => {
        console.log("Checking parameter:", key, "type:", typeof parameters[key]);
        
        if (key.includes('_count')) {
          const fieldName = key.replace('_count', '');
          const fileCount = parseInt(parameters[key]) || 0;
          console.log("Found file count for " + fieldName + ": " + fileCount);
          
          files[fieldName] = [];
          for (let i = 0; i < fileCount; i++) {
            const fileKey = `${fieldName}_${i}`;
            console.log("Looking for file parameter: " + fileKey);
            
            if (parameters[fileKey]) {
              const fileParam = parameters[fileKey];
              console.log("Found file parameter " + fileKey + ", type: " + typeof fileParam);
              console.log("Has getName method:", typeof fileParam.getName === 'function');
              console.log("Has getBytes method:", typeof fileParam.getBytes === 'function');
              
              // Try different ways to access the file
              try {
                if (fileParam && typeof fileParam.getName === 'function') {
                  console.log("Processing as blob: " + fileParam.getName());
                  files[fieldName].push({
                    blob: fileParam,
                    name: fileParam.getName(),
                    size: fileParam.getBytes ? fileParam.getBytes().length : 0
                  });
                } else if (fileParam && fileParam.toString && fileParam.toString() !== '[object Object]') {
                  console.log("File " + fileKey + " is NOT a blob, value: " + fileParam);
                } else {
                  console.log("File " + fileKey + " is an object:", JSON.stringify(fileParam));
                }
              } catch (err) {
                console.log("Error processing file " + fileKey + ":", err.toString());
              }
            } else {
              console.log("File parameter " + fileKey + " not found in parameters");
            }
          }
        }
      });
      
      console.log("Final files object:", JSON.stringify(Object.keys(files)));
      console.log("=== END APPS SCRIPT DEBUG ===");
    }
    
    Logger.log("Received payload: %s", JSON.stringify(data));
    Logger.log("Received files: %s", JSON.stringify(Object.keys(files)));

    // Open the Google Sheet by its ID
    const sheet = SpreadsheetApp.openById("1jrIr8JFoNtSsIsGWEOpDd0IBmMo0WyhQIaRSs63FEC0"); 
    const sheetTab = sheet.getActiveSheet();
    
    // Create a folder for this submission in Google Drive
    const submissionId = Utilities.getUuid();
    const timestamp = new Date();
    const folderName = `Application_${data.firstName || 'Unknown'}_${data.lastName || 'User'}_${timestamp.getTime()}`;
    
    let submissionFolder = null;
    let fileUrls = [];
    
    // Handle file uploads
    if (Object.keys(files).length > 0) {
      try {
        // Get or create the main applications folder
        let mainFolder;
        try {
          mainFolder = DriveApp.getFoldersByName("Form_Applications").next();
        } catch (e) {
          mainFolder = DriveApp.createFolder("Form_Applications");
        }
        
        // Create submission-specific folder
        submissionFolder = mainFolder.createFolder(folderName);
        
        // Save each file
        Object.keys(files).forEach(fieldName => {
          files[fieldName].forEach((file, index) => {
            try {
              const savedFile = submissionFolder.createFile(file.blob);
              savedFile.setName(`${fieldName}_${index + 1}_${file.name}`);
              
              // Make file viewable by anyone with the link (optional)
              savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              
              fileUrls.push({
                fieldName: fieldName,
                fileName: file.name,
                fileSize: formatFileSize(file.size),
                fileUrl: savedFile.getUrl(),
                fileId: savedFile.getId()
              });
              
              Logger.log("File saved: %s", savedFile.getName());
            } catch (fileError) {
              Logger.log("Error saving file %s: %s", file.name, fileError.toString());
            }
          });
        });
      } catch (driveError) {
        Logger.log("Error creating Drive folder: %s", driveError.toString());
      }
    }

    // Extract fields from the payload
    const gender = data.gender || "";
    const firstName = data.firstName || "";
    const lastName = data.lastName || "";
    const birth = data.birth || "";
    const email = data.email || "";
    const number = data.number || "";
    const fileCount = fileUrls.length;
    const folderUrl = submissionFolder ? submissionFolder.getUrl() : "";
    
    // Append data to the next row in the sheet including file information
    sheetTab.appendRow([
      gender, 
      firstName, 
      lastName, 
      birth, 
      email, 
      number, 
      timestamp,
      fileCount,
      folderUrl,
      submissionId
    ]);

    // Log successful data insertion
    Logger.log("Data saved successfully to Google Sheet.");

    // Prepare email body with file information
    let fileInfo = "";
    if (fileUrls.length > 0) {
      fileInfo = "\n\nUploaded Files:\n";
      fileUrls.forEach(file => {
        fileInfo += `- ${file.fileName} (${file.fileSize}) - ${file.fileUrl}\n`;
      });
      fileInfo += `\nAll files folder: ${folderUrl}`;
    }

    // Send an email notification
    const recipient = "tristan.g.m.thomas@gmail.com";
    const subject = "New Form Submission Received";
    const body = `
      A new form submission was received:
      - Gender: ${gender}
      - First Name: ${firstName}
      - Last Name: ${lastName}
      - Birth Date: ${birth}
      - Email: ${email}
      - Phone Number: ${number}
      - Submitted At: ${timestamp}
      - Files Uploaded: ${fileCount}${fileInfo}
    `;
    MailApp.sendEmail(recipient, subject, body);

    Logger.log("Email sent successfully to %s", recipient);

    // Send a response back to the client
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        message: "Data saved and email sent successfully",
        submissionId: submissionId,
        fileCount: fileCount,
        folderUrl: folderUrl
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("Error handling POST request: %s", error.toString());

    // Return an error response
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Error handling POST request",
        details: error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function formatFileSize(bytes) {
if (bytes === 0) return '0 Bytes';
const k = 1024;
const sizes = ['Bytes', 'KB', 'MB', 'GB'];
const i = Math.floor(Math.log(bytes) / Math.log(k));
return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}