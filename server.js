const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));
app.use(express.json());

// OAuth2 Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.REDIRECT_URL
);

const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/auth/youtube', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Store tokens in session or database in production
    // For now, we'll pass them in URL (not recommended for production)
    res.redirect(`/?tokens=${encodeURIComponent(JSON.stringify(tokens))}`);
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/api/playlists', async (req, res) => {
  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const response = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50
    });
    
    const playlists = response.data.items.map(item => ({
      id: item.id,
      title: item.snippet.title
    }));
    
    res.json(playlists);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const { query, playlistId } = req.query;
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    if (playlistId) {
      const response = await youtube.playlistItems.list({
        part: ['snippet'],
        playlistId: playlistId,
        maxResults: 50
      });
      
      const videos = await Promise.all(response.data.items.map(async (item) => {
        const videoResponse = await youtube.videos.list({
          part: ['snippet'],
          id: [item.snippet.resourceId.videoId]
        });
        
        const video = videoResponse.data.items[0];
        return {
          id: video.id,
          title: video.snippet.title,
          thumbnail: video.snippet.thumbnails.medium.url,
          playlistId: playlistId
        };
      }));
      
      res.json(videos);
    } else {
      const response = await youtube.search.list({
        part: ['snippet'],
        type: 'video',
        maxResults: 50,
        q: query
      });
      
      const videos = response.data.items.map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url
      }));
      
      res.json(videos);
    }
  } catch (error) {
    console.error('Error searching videos:', error);
    res.status(500).json({ error: 'Failed to search videos' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
