# Google Drive API Setup Guide

## Prerequisites
1. A Google Cloud Project with billing enabled
2. Google Drive API, Google Docs API, Google Sheets API, and Google Slides API enabled

## Setup Steps

### 1. Create a Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "Service account"
5. Fill in the service account details and click "Create"
6. For the role, select "Project" > "Editor"
7. Click "Done" to create the service account

### 2. Create and Download Service Account Key
1. In the Credentials page, find your service account and click on it
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose JSON as the key type and click "Create"
5. The JSON key file will be downloaded automatically

### 3. Add Service Account to Google Drive
1. Open the Google Drive folder or file you want to access
2. Click the "Share" button
3. Add the service account email (found in the client_email field of the JSON key file)
4. Set the appropriate permission level (at least "Viewer")

### 4. Add the Key to Your Project
1. Rename the downloaded JSON key file to `service-account-key.json`
2. Place it in the root of your Electron project (same level as `package.json`)

### 5. Enable Required APIs
Make sure the following APIs are enabled for your project:
- Google Drive API
- Google Docs API
- Google Sheets API
- Google Slides API

## Testing the Integration

After setting up the service account and adding the key file, you can test the integration by running:

```bash
node test/testGoogleDriveAuth.js
```

## Troubleshooting

### Common Issues

1. **Insufficient permissions**
   - Make sure the service account has been added to the Google Drive file/folder with the correct permissions
   - Ensure the service account has the necessary IAM roles in Google Cloud Console

2. **API not enabled**
   - Verify that all required APIs are enabled in the Google Cloud Console

3. **Invalid credentials**
   - Double-check that the service account key file is correctly placed and formatted
  
4. **Rate limiting**
   - The Google Drive API has rate limits. If you encounter rate limit errors, implement exponential backoff in your code.

## Security Notes

- **Never commit the service account key file** to version control
- Add `service-account-key.json` to your `.gitignore` file
- Use environment variables for production deployments
- Restrict the service account permissions to only what's necessary
