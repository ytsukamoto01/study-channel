// /api/debug/test-thread-api.js - threads APIの動作をテスト
export default async function handler(req, res) {
  try {
    const { threadId } = req.query;
    
    if (!threadId) {
      return res.status(400).json({ error: 'threadId parameter is required' });
    }

    console.log('Testing threads API for threadId:', threadId);
    
    // 内部でthreads APIを呼び出し
    const threadsApiUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/tables/threads/${threadId}`;
    
    console.log('Calling threads API:', threadsApiUrl);
    
    const response = await fetch(threadsApiUrl, {
      headers: {
        'User-Agent': 'Debug-Test-API',
      }
    });
    
    console.log('Threads API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Threads API error:', errorText);
      return res.status(500).json({
        error: 'Threads API call failed',
        status: response.status,
        details: errorText
      });
    }
    
    const responseData = await response.json();
    console.log('Threads API response data:', responseData);
    
    // レスポンスを分析
    const analysis = {
      threadId: threadId,
      apiCallSuccess: true,
      responseStatus: response.status,
      threadData: responseData.data,
      likeCountInResponse: responseData.data?.like_count,
      hasLikeCount: responseData.data?.like_count !== undefined,
      likeCountValue: responseData.data?.like_count || 0,
      timestamp: new Date().toISOString()
    };
    
    console.log('Analysis result:', analysis);
    
    return res.status(200).json(analysis);
    
  } catch (error) {
    console.error('Test threads API error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}