// テスト用スレッド作成スクリプト
const testThreadsData = [
  {
    title: "数学の勉強法について語りましょう",
    content: "高校数学で効率的な勉強方法について議論したいです。特に微積分の理解を深めるコツがあれば教えてください。",
    category: "大学受験",
    subcategory: "数学",
    author_name: "数学好き"
  },
  {
    title: "英語のリスニング対策",
    content: "TOEICや英検のリスニング対策で効果的な方法を知りたいです。おすすめの教材やアプリがあれば教えてください。",
    category: "資格試験",
    subcategory: "英語",
    author_name: "英語学習者"
  },
  {
    title: "公務員試験の面接対策",
    content: "来年公務員試験を受ける予定です。面接で気をつけるべきポイントや練習方法について教えてください。",
    category: "公務員試験",
    subcategory: "面接",
    author_name: "匿名"
  },
  {
    title: "物理の力学分野が苦手です",
    content: "運動方程式や力の分析がうまくできません。基礎から理解するための勉強法を教えてください。",
    category: "高校受験",
    subcategory: "物理",
    author_name: "理科実験中"
  },
  {
    title: "中学受験の国語対策",
    content: "息子の中学受験で国語の成績が伸び悩んでいます。読解力を上げる方法について相談させてください。",
    category: "中学受験",
    subcategory: "国語",
    author_name: "受験生の親"
  },
  {
    title: "就職活動のSPI対策について",
    content: "来春卒業予定で就職活動中です。SPIテストの数的処理が特に苦手なので対策法を教えてください。",
    category: "就職試験",
    subcategory: "SPI",
    author_name: "就活生"
  },
  {
    title: "古文の助動詞の覚え方",
    content: "古文の助動詞活用がなかなか覚えられません。効率的な暗記方法やコツがあれば教えてください。",
    category: "大学受験",
    subcategory: "古文",
    author_name: "古典愛好家"
  },
  {
    title: "化学の計算問題攻略法",
    content: "化学の mol計算や濃度計算でよく間違えます。計算ミスを減らすコツを知りたいです。",
    category: "高校受験",
    subcategory: "化学",
    author_name: "化学専攻"
  },
  {
    title: "世界史の年号暗記術",
    content: "世界史の年号がなかなか頭に入りません。語呂合わせ以外で効果的な暗記方法はありますか？",
    category: "大学受験",
    subcategory: "世界史",
    author_name: "世界史派"
  },
  {
    title: "ITパスポート試験対策",
    content: "ITパスポート試験を受ける予定です。効率的な勉強計画の立て方を教えてください。",
    category: "資格試験",
    subcategory: "IT",
    author_name: "IT学習者"
  },
  {
    title: "生物の遺伝分野について",
    content: "遺伝の法則や染色体の分離について理解が曖昧です。分かりやすい説明をお願いします。",
    category: "高校受験",
    subcategory: "生物",
    author_name: "生物好き"
  },
  {
    title: "地理の統計資料の読み方",
    content: "地理のグラフや統計表を読み取る問題が苦手です。コツや注意点を教えてください。",
    category: "大学受験",
    subcategory: "地理",
    author_name: "地理研究者"
  },
  {
    title: "簿記3級の仕訳問題",
    content: "簿記3級の勉強をしていますが、仕訳の考え方がよく分かりません。基本的なルールを教えてください。",
    category: "資格試験",
    subcategory: "簿記",
    author_name: "会計初心者"
  },
  {
    title: "現代文の記述問題対策",
    content: "現代文の記述問題で部分点がもらえるような答案の書き方を知りたいです。",
    category: "大学受験",
    subcategory: "現代文",
    author_name: "現代文派"
  },
  {
    title: "中学数学の図形問題",
    content: "中学3年生です。図形の証明問題がとても苦手で困っています。解き方のコツを教えてください。",
    category: "高校受験",
    subcategory: "数学",
    author_name: "中学3年生"
  },
  {
    title: "管理人からのお知らせ",
    content: "いつもご利用ありがとうございます。サーバーメンテナンスのお知らせです。",
    category: "その他",
    subcategory: "お知らせ",
    author_name: "管理人"
  },
  {
    title: "政治経済の時事問題対策",
    content: "政経の時事問題で出題されやすいテーマや情報収集の方法について教えてください。",
    category: "大学受験",
    subcategory: "政経",
    author_name: "政経学習中"
  },
  {
    title: "看護師国家試験の勉強法",
    content: "看護師国家試験の勉強をしています。膨大な範囲を効率よく覚える方法はありますか？",
    category: "資格試験",
    subcategory: "医療",
    author_name: "看護学生"
  },
  {
    title: "倫理の思想家まとめ",
    content: "西洋思想史の哲学者たちの考えが混同してしまいます。整理して覚える方法を教えてください。",
    category: "大学受験",
    subcategory: "倫理",
    author_name: "倫理考察中"
  },
  {
    title: "集中力を持続させる方法",
    content: "長時間勉強していると集中力が続きません。効果的な休憩の取り方や集中力アップの方法を教えてください。",
    category: "その他",
    subcategory: "勉強法",
    author_name: "集中モード中"
  }
];

// データベースに投稿するためのAPIリクエスト関数
async function createTestThread(threadData) {
  try {
    const response = await fetch('/api/tables/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...threadData,
        hashtags: [],
        images: [],
        user_fingerprint: 'test-user-' + Math.random().toString(36).substring(7)
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ スレッド作成成功:', threadData.title);
      return result;
    } else {
      const error = await response.json();
      console.error('❌ スレッド作成失敗:', threadData.title, error);
      return null;
    }
  } catch (error) {
    console.error('❌ API呼び出しエラー:', threadData.title, error);
    return null;
  }
}

// 全てのテストスレッドを作成
async function createAllTestThreads() {
  console.log('🚀 テストスレッド20個の作成を開始...');
  
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < testThreadsData.length; i++) {
    const threadData = testThreadsData[i];
    console.log(`📝 [${i + 1}/20] 作成中: ${threadData.title}`);
    
    const result = await createTestThread(threadData);
    if (result) {
      successCount++;
    } else {
      failCount++;
    }
    
    // 少し待機してAPIの負荷を軽減
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`🎉 作成完了! 成功: ${successCount}件, 失敗: ${failCount}件`);
  
  // ページをリロードして結果を表示
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

// スクリプト実行
createAllTestThreads();