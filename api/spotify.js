const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`;
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`;
const TOP_TRACKS_ENDPOINT = `https://api.spotify.com/v1/me/top/tracks?limit=10`;
const FOLLOWED_ARTISTS_ENDPOINT = `https://api.spotify.com/v1/me/following?type=artist`;
const PAUSE_ENDPOINT = `https://api.spotify.com/v1/me/player/pause`;
const PLAY_ENDPOINT = `https://api.spotify.com/v1/me/player/play`;

const getAccessToken = async () => {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  });

  return response.json();
};

const spotifyFetch = async (endpoint, method = 'GET', body = null) => {
  const { access_token } = await getAccessToken();

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
    options.headers['Content-Type'] = 'application/json';
  }

  return fetch(endpoint, options);
};

const getNowPlaying = async () => {
  const response = await spotifyFetch(NOW_PLAYING_ENDPOINT);
  if (response.status === 204 || response.status > 400) {
    return { isPlaying: false, message: "Currently not playing." };
  }
  const song = await response.json();
  if (!song.item) {
    return { isPlaying: false, message: "Currently not playing (device inactive)." };
  }
  return {
    isPlaying: song.is_playing,
    title: song.item.name,
    artist: song.item.artists.map((_artist) => _artist.name).join(', '),
    album: song.item.album.name,
    albumImageUrl: song.item.album.images[0]?.url,
    songUrl: song.item.external_urls.spotify,
  };
};

const getTopTracks = async () => {
  const response = await spotifyFetch(`${TOP_TRACKS_ENDPOINT}?limit=10&time_range=short_term`);
  const { items } = await response.json();
  return items.map((track) => ({
    title: track.name,
    artist: track.artists.map((_artist) => _artist.name).join(', '),
    songUrl: track.external_urls.spotify,
    uri: track.uri,
  }));
};

const getFollowedArtists = async () => {
  const response = await spotifyFetch(`${FOLLOWED_ARTISTS_ENDPOINT}?type=artist&limit=20`);
  const { artists } = await response.json();
  return artists.items.map((artist) => ({
    name: artist.name,
    artistUrl: artist.external_urls.spotify,
    imageUrl: artist.images[0]?.url,
  }));
};

const pausePlayback = async () => {
  const response = await spotifyFetch(PAUSE_ENDPOINT, 'PUT');
  return response.status === 204;
};

const playTrack = async (uri) => {
  const response = await spotifyFetch(PLAY_ENDPOINT, 'PUT', {
    uris: [uri],
  });
  return response.status === 204;
};

export default async function handler(req, res) {
  try {
    const action = req.query.action;
    const uri = req.query.uri;

    if (action === 'pause') {
      await pausePlayback();
      return res.status(200).json({ status: 'paused' });
    }

    if (action === 'play' && uri) {
      await playTrack(uri);
      return res.status(200).json({ status: 'playing', uri: uri });
    }

    const [nowPlaying, topTracks, followedArtists] = await Promise.all([
      getNowPlaying(),
      getTopTracks(),
      getFollowedArtists(),
    ]);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({
      nowPlaying,
      topTracks,
      followedArtists,
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Server par kuch galat hua.' });
  }
}