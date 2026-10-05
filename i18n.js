/* YC&AC Pulse — internationalisation (requirement 1).
   Languages: English (default), 日本語, 简体中文.
   - ?lang= URL param wins, then localStorage, then English.
   - Applies to [data-i18n] text, [data-i18n-html] innerHTML, [data-i18n-placeholder],
     [data-i18n-aria], <html data-i18n-title>, and every [data-lang-select] dropdown.
   - Pages re-render their dynamic content by subscribing: YCACI18n.onChange(fn).
   - Note: coach-authored content (guidelines, match feedback) is shown as written —
     only the interface is translated. */

const YCACI18n = (() => {
  const LANGUAGES = { en: "English", ja: "日本語", zh: "简体中文" };
  const LOCALES = { en: "en-GB", ja: "ja-JP", zh: "zh-CN" };
  const STORAGE_KEY = "ycac-lang";

  const en = {
    officialWebsite: "Official Soccer Top Team · Est. 1868", officialTeam: "YC&AC Official Soccer Top Team",
    season: "YC&AC Football · Season 2026", report: "YC&AC Pulse",
    intro: "YC&AC's official Top Team. Follow our season, join team events, and stay connected with the squad.",
    heroNote: "Proudly representing Yokohama Country & Athletic Club", about: "About the Team",
    introductionOne: "YC&AC Pulse is built on ambition, structure and the spirit of the Club.",
    introductionTwo: "YC&AC Pulse brings together players of diverse backgrounds with a shared goal: to compete, improve and represent YC&AC with pride.",
    introductionThree: "More than just a team, it is a platform for committed football, strong camaraderie and continuous growth, both on and off the pitch.",
    navSeason: "Season", navStandings: "Standings", navSchedule: "Schedule",
    scheduleLink: "Team Scheduling & Event Sign Up", standingsLink: "TML Division 3 Standings",
    clubLink: "YC&AC Club Website", standardSignup: "Standard Sign Up", prioritySignup: "YC&AC Priority",
    seasonStats: "Season Statistics",
    footer: "YC&AC Pulse · Official Soccer Top Team of Yokohama Country & Athletic Club",
    record: "Record", goalsFor: "Goals for", goalsAgainst: "Goals against", cleanSheets: "Clean sheets",
    upcoming: "Upcoming", fixtures: "Next Matches", kickoff: "Kickoff", matchday: "Season", results: "Results",
    attack: "Attack", contributions: "Goal Contributions", availability: "Availability", attendance: "Attendance",
    player: "Player", position: "Position", attendanceRate: "Attendance", summary: "Summary",
    searchPlayer: "Search player", swipeHint: "Swipe left and right to view match columns.",
    starter: "Starter", substitute: "Substitute", scored: "Scored", cleanSheet: "Clean sheet (GK)",
    contact: "Contact", contactTitle: "Contact YC&AC Pulse",
    contactCopy: "Send the team a message about fixtures, events, or the club.",
    name: "Name", email: "Email", message: "Message", sendMessage: "Send message",
    instagram: "Instagram", instagramTitle: "Follow YC&AC Pulse",
    instagramCopy: "Match graphics, team news, and moments from the squad. Contact the team directly on Instagram.",
    versus: "vs", goals: "goals", assists: "assists", liveData: "Live data", matchesRecorded: "matches recorded",
    unavailable: "Data is currently unavailable", squadPicker: "Squad Picker",
    // page chrome / composites
    pageTitle: "YC&AC Pulse | Official Team Website", languageLabel: "Language",
    friendlyMatches: "Friendly Matches", wdl: "W-D-L",
    recordAria: "{wins} wins, {draws} draws, {losses} losses", seasonEyebrow: "Season 2026",
    vizEyebrow: "Goals", vizTopScorers: "Top Scorers", vizTimeline: "Results Timeline",
    vizFriendly: "Friendly", vizWin: "W", vizDraw: "D", vizLoss: "L",
    // squad picker page
    pickerPageTitle: "YC&AC Pulse | Squad Picker",
    pickerTeam: "Official Soccer Top Team", pickerBack: "Back to season", pickerTool: "Matchday tool",
    pickerTitle: "Squad<br /><em>Picker</em>",
    pickerIntro: "Shape the starting XI, test the balance, and share the team sheet.",
    pickerSelected: "of 20 selected", pickerEvent: "Event", pickerFormation: "Formation",
    pickerSuggest: "Suggest squad", pickerClear: "Clear squad", pickerCopy: "Copy lineup",
    pickerImage: "Save squad image", pickerStarting: "Starting XI", pickerBench: "Matchday bench",
    pickerSubs: "/ 9 substitutes", pickerAvailable: "Available squad", pickerPlayers: "Players",
    pickerSearch: "Search player", pickerSheet: "Team sheet",
    pickerOutput: "Your selected XI will appear here.", pickerOpen: "Open substitute",
    pickerStartingOutput: "Starting XI", pickerSubsOutput: "Subs", pickerRefreshBench: "Refresh bench",
    pickerDate: "Date", pickerOpponent: "Opponent", pickerCompetition: "Competition", pickerVenue: "Venue",
    pickerKickoff: "Kickoff", pickerSaveSquad: "Save squad", pickerImageSaved: "Squad image saved.",
    pickerArtStarting: "STARTING XI", pickerArtSubs: "SUBSTITUTES", pickerArtSubsShort: "SUBS",
    pickerArtStartingLong: "Starting XI", pickerArtBench: "MATCHDAY BENCH", pickerArtTeam: "OFFICIAL SOCCER TOP TEAM",
    // squad picker status messages
    pickerStatusPitch: "Choose a pitch slot, then select a player.",
    pickerStatusPickSlot: "Select a player for this {role} slot.",
    pickerStatusFull: "The 20-player matchday squad is full. Select a slot to replace a player.",
    pickerStatusAdded: "{name} added to the matchday squad.",
    pickerStatusConfirmed: "Confirmed signups loaded. Use Suggest squad or select players.",
    pickerStatusNoSignups: "No confirmed signups yet. Add confirmed players to the EventSignups sheet.",
    pickerStatusPast: "Recorded lineup loaded. Adjust it if needed.",
    pickerStatusSavedLoaded: "Saved squad loaded. Adjust it if needed.",
    pickerStatusNoEligible: "No eligible players for this event yet.",
    pickerStatusNeedXI: "Select a Starting XI before saving.",
    pickerStatusBenchRefreshed: "Bench refreshed from players not in the Starting XI.",
    pickerSaving: "Saving...", pickerSaved: "Saved",
    pickerSaveSuccess: "Squad saved to Google Sheets.",
    pickerSaveFail: "Could not save the squad. Please try again.",
    pickerSubmitted: "Squad submitted to Google Sheets.",
    pickerLoadFailed: "The squad data could not be loaded. Please try again.",
    pickerLoading: "Loading squad...",
    pickerNeedPlayers: "Select players before saving an image.",
    pickerImageOpened: "Image opened. Use your browser Save or Share control to keep it.",
    pickerImageFailed: "Could not create the squad image.",
    pickerShareOpened: "Share menu opened.",
    pickerImageCreated: "Squad image created. Download or share it.",
    pickerDownloadImage: "Download image", pickerClose: "Close", pickerPreviewOpened: "Squad image preview opened.",
    pickerNeedOnePlayer: "Select at least one player before saving an image.",
    pickerStatusSuggested: "Suggested from past appearances. Review and adjust the XI and bench.",
    pickerPngFailed: "PNG conversion failed; using SVG export.",
    pickerShareFailed: "Native share failed; showing download.",
    pickerCopied: "Lineup copied to your clipboard.",
    pickerCopyUnavailable: "Copy is unavailable in this browser.",
    // login / auth (Phase 4)
    loginTitle: "Sign in | YC&AC Pulse", loginHeading: "Sign in",
    loginTeamTitle: "Players & team",
    loginTeamCopy: "For players and team staff — enter the shared team password.",
    loginTeamLabel: "Team password",
    loginCoachTitle: "Coach",
    loginCoachCopy: "For coaches and managers — sign in with your own account.",
    loginEmail: "Email", loginPassword: "Password", authLogin: "Log in",
    loginFailed: "Login failed — check your details and try again.",
    loginNeedCoach: "This page needs a coach account. Sign in below with the coach login.",
    loginSignedIn: "Signed in",
    loginRoleCoach: "Coach — full access", loginRoleTeam: "Team member — view only",
    authLogout: "Log out", loginContinue: "Continue", loginHome: "Back to season",
    // coach dashboard (Phase 5)
    coachTitle: "Coach Dashboard | YC&AC Pulse",
    coachEyebrow: "Private team tool",
    coachHeading: "Coach Dashboard",
    coachIntro: "Stable-squad board, next-fixture signups, position coverage, and review flags — live from the team database.",
    coachPlayers: "Players", coachUsed: "Used", coachMatches: "Matches",
    coachCompetition: "Competition",
    lensTml: "TML Division 3", lensFriendly: "Friendlies", lensAll: "All matches",
    coachNextFixture: "Next fixture", coachNoFixture: "No upcoming fixture.",
    coachSignups: "Signups", coachNoSignups: "No signups recorded for this fixture yet.",
    coachResponded: "{count} of {total} responded",
    signupConfirmed: "Confirmed", signupWaitlist: "Waitlist", signupDeclined: "Declined", signupUnavailable: "Unavailable",
    coachBoard: "Squad board",
    tierCore: "Core", tierRotation: "Rotation", tierDepth: "Depth", tierInactive: "Inactive",
    shirtNumber: "No.", statApps: "Apps", statStarts: "Starts", statGoals: "Goals", statAssists: "Assists", statReliability: "Reliability",
    coachCoverage: "Position coverage",
    coachFlags: "Flags to review",
    flagMissingPhotos: "Missing photos", flagDuplicateNumbers: "Duplicate shirt numbers",
    flagFriendlyOnly: "Friendly-only players", flagDeclinedButPlayed: "Declined but played",
    flagNone: "Nothing to flag.",
    coachLoading: "Loading team data…", coachError: "Could not load team data — refresh to try again.",
  };

  const ja = {
    officialWebsite: "公式サッカートップチーム · Est. 1868", officialTeam: "YC&AC 公式サッカートップチーム",
    season: "YC&AC フットボール · 2026シーズン", report: "YC&AC Pulse",
    intro: "YC&ACの公式トップチーム。シーズンの記録、チームイベント、チームの最新情報をご覧ください。",
    heroNote: "横浜カントリー＆アスレティッククラブを代表するトップチームです", about: "チームについて",
    introductionOne: "YC&AC Pulseは、向上心、組織力、そしてクラブの精神を礎としています。",
    introductionTwo: "多様なバックグラウンドを持つ選手が集まり、競い合い、成長し、YC&ACを誇りを持って代表するという共通の目標を掲げています。",
    introductionThree: "単なるチームではなく、真摯なフットボール、強い仲間意識、そしてピッチ内外での継続的な成長のための場です。",
    navSeason: "シーズン", navStandings: "順位表", navSchedule: "日程",
    scheduleLink: "チーム日程・イベント参加申込", standingsLink: "TML Division 3 順位表",
    clubLink: "YC&AC クラブ公式サイト", standardSignup: "通常申込", prioritySignup: "YC&AC 優先申込",
    seasonStats: "シーズン成績",
    footer: "YC&AC Pulse · 横浜カントリー＆アスレティッククラブ公式サッカートップチーム",
    record: "戦績", goalsFor: "得点", goalsAgainst: "失点", cleanSheets: "無失点試合",
    upcoming: "次の試合", fixtures: "今後の試合", kickoff: "キックオフ", matchday: "シーズン", results: "リザルト",
    attack: "攻撃", contributions: "ゴール貢献", availability: "出席状況", attendance: "出席",
    player: "選手", position: "ポジション", attendanceRate: "出席率", summary: "集計",
    searchPlayer: "選手を検索", swipeHint: "左右にスワイプして試合の列を表示できます。",
    starter: "先発", substitute: "途中出場", scored: "ゴール", cleanSheet: "無失点（GK）",
    contact: "お問い合わせ", contactTitle: "YC&AC Pulse へのお問い合わせ",
    contactCopy: "試合、イベント、チームに関するお問い合わせをお送りください。",
    name: "お名前", email: "メールアドレス", message: "メッセージ", sendMessage: "メッセージを送信",
    instagram: "Instagram", instagramTitle: "YC&AC Pulse をフォロー",
    instagramCopy: "試合グラフィック、チームニュース、チームの瞬間をお届けします。Instagramからチームへ直接お問い合わせください。",
    versus: "vs", goals: "ゴール", assists: "アシスト", liveData: "最新データ", matchesRecorded: "試合を記録",
    unavailable: "データを読み込めません", squadPicker: "メンバー選出",
    pageTitle: "YC&AC Pulse | 公式チームサイト", languageLabel: "言語",
    friendlyMatches: "親善試合", wdl: "勝-分-敗",
    recordAria: "{wins}勝 {draws}分 {losses}敗", seasonEyebrow: "2026 シーズン",
    vizEyebrow: "ゴール", vizTopScorers: "得点ランキング", vizTimeline: "シーズン結果",
    vizFriendly: "親善試合", vizWin: "勝", vizDraw: "分", vizLoss: "敗",
    pickerPageTitle: "YC&AC Pulse | メンバー選出",
    pickerTeam: "公式サッカートップチーム", pickerBack: "シーズンページへ", pickerTool: "試合ツール",
    pickerTitle: "メンバー<br /><em>選出</em>",
    pickerIntro: "先発メンバーを組み、バランスを確認して、チームシートを共有できます。",
    pickerSelected: "20人中選出", pickerEvent: "イベント", pickerFormation: "フォーメーション",
    pickerSuggest: "候補を作成", pickerClear: "クリア", pickerCopy: "コピー",
    pickerImage: "画像を保存", pickerStarting: "先発 XI", pickerBench: "控えメンバー",
    pickerSubs: "/ 控え9人", pickerAvailable: "参加可能メンバー", pickerPlayers: "選手",
    pickerSearch: "選手を検索", pickerSheet: "チームシート",
    pickerOutput: "選択した先発XIがここに表示されます。", pickerOpen: "空き枠",
    pickerStartingOutput: "先発XI", pickerSubsOutput: "控え", pickerRefreshBench: "控えを更新",
    pickerDate: "日付", pickerOpponent: "対戦", pickerCompetition: "大会", pickerVenue: "会場",
    pickerKickoff: "開始", pickerSaveSquad: "メンバーを保存", pickerImageSaved: "メンバー画像を保存しました。",
    pickerArtStarting: "先発 XI", pickerArtSubs: "控えメンバー", pickerArtSubsShort: "控え",
    pickerArtStartingLong: "先発メンバー", pickerArtBench: "控えメンバー", pickerArtTeam: "公式サッカートップチーム",
    pickerStatusPitch: "ピッチのポジションを選び、選手を選択してください。",
    pickerStatusPickSlot: "この{role}枠の選手を選択してください。",
    pickerStatusFull: "20人のメンバーが埋まりました。差し替える枠を選択してください。",
    pickerStatusAdded: "{name} をメンバーに追加しました。",
    pickerStatusConfirmed: "確定した申込を読み込みました。候補を作成するか選手を選択してください。",
    pickerStatusNoSignups: "確定した申込がまだありません。EventSignups に確定選手を追加してください。",
    pickerStatusPast: "記録済みのメンバーを読み込みました。必要に応じて調整してください。",
    pickerStatusSavedLoaded: "保存済みのメンバーを読み込みました。必要に応じて調整してください。",
    pickerStatusNoEligible: "この試合の対象選手がまだいません。",
    pickerStatusNeedXI: "保存する前に先発メンバーを選択してください。",
    pickerStatusBenchRefreshed: "控えメンバーを更新しました。",
    pickerSaving: "保存中...", pickerSaved: "保存済み",
    pickerSaveSuccess: "メンバーを保存しました。",
    pickerSaveFail: "保存できませんでした。もう一度お試しください。",
    pickerSubmitted: "Google Sheets に保存しました。",
    pickerLoadFailed: "データを読み込めませんでした。もう一度お試しください。",
    pickerLoading: "読み込み中...",
    pickerNeedPlayers: "保存する前にメンバーを選択してください。",
    pickerImageOpened: "画像を開きました。ブラウザの保存または共有機能を使ってください。",
    pickerImageFailed: "画像を作成できませんでした。",
    pickerShareOpened: "共有メニューを開きました。",
    pickerImageCreated: "画像を作成しました。ダウンロードまたは共有してください。",
    pickerDownloadImage: "画像をダウンロード", pickerClose: "閉じる", pickerPreviewOpened: "画像プレビューを開きました。",
    pickerNeedOnePlayer: "保存する前に1人以上の選手を選択してください。",
    pickerStatusSuggested: "過去の出場履歴から候補を作成しました。先発と控えを確認して調整してください。",
    pickerPngFailed: "PNG変換に失敗しました。SVGで書き出します。",
    pickerShareFailed: "共有に失敗しました。ダウンロードを表示します。",
    pickerCopied: "メンバーをクリップボードにコピーしました。",
    pickerCopyUnavailable: "このブラウザではコピー機能を使用できません。",
    // login / auth (Phase 4)
    loginTitle: "ログイン | YC&AC Pulse", loginHeading: "サインイン",
    loginTeamTitle: "選手・チーム",
    loginTeamCopy: "選手・スタッフ向け：共有されているチームパスワードを入力してください。",
    loginTeamLabel: "チームパスワード",
    loginCoachTitle: "コーチ",
    loginCoachCopy: "コーチ・管理者向け：ご自身のアカウントでサインインしてください。",
    loginEmail: "メールアドレス", loginPassword: "パスワード", authLogin: "ログイン",
    loginFailed: "ログインに失敗しました。入力内容を確認してください。",
    loginNeedCoach: "このページにはコーチアカウントが必要です。下のコーチログインからサインインしてください。",
    loginSignedIn: "サインイン中",
    loginRoleCoach: "コーチ — 全権限", loginRoleTeam: "チームメンバー — 閲覧のみ",
    authLogout: "ログアウト", loginContinue: "続行", loginHome: "シーズンページへ",
    // coach dashboard (Phase 5)
    coachTitle: "コーチダッシュボード | YC&AC Pulse",
    coachEyebrow: "チーム専用ツール",
    coachHeading: "コーチダッシュボード",
    coachIntro: "スターブル陣容ボード、次の試合の出場可否、ポジションカバー、確認フラグをチームデータベースから自動更新。",
    coachPlayers: "選手", coachUsed: "出場経験", coachMatches: "試合",
    coachCompetition: "大会",
    lensTml: "TMLディビジョン3", lensFriendly: "フレンドリー", lensAll: "全試合",
    coachNextFixture: "次の試合", coachNoFixture: "次の試合はありません。",
    coachSignups: "出場可否", coachNoSignups: "この試合の出場可否はまだ入力されていません。",
    coachResponded: "{total}人中{count}人が回答",
    signupConfirmed: "参加", signupWaitlist: "補欠", signupDeclined: "辞退", signupUnavailable: "都合がつかない",
    coachBoard: "チームボード",
    tierCore: "主力", tierRotation: "ローテーション", tierDepth: "控え", tierInactive: "不活発",
    shirtNumber: "背番号", statApps: "出場", statStarts: "先発", statGoals: "得点", statAssists: "アシスト", statReliability: "信頼度",
    coachCoverage: "ポジションカバー",
    coachFlags: "確認フラグ",
    flagMissingPhotos: "写真が未登録", flagDuplicateNumbers: "背番号の重複",
    flagFriendlyOnly: "フレンドリーのみ出場", flagDeclinedButPlayed: "欠場申告だが出場",
    flagNone: "フラグはありません。",
    coachLoading: "チームデータを読み込み中…", coachError: "データの読み込みに失敗しました。再読み込みしてください。",
  };

  const zh = {
    officialWebsite: "官方足球一线队 · Est. 1868", officialTeam: "YC&AC 官方足球一线队",
    season: "YC&AC 足球 · 2026 赛季", report: "YC&AC Pulse",
    intro: "YC&AC 官方一线队。关注赛季动态、参加球队活动，与球队保持联系。",
    heroNote: "自豪地代表横浜乡村及体育俱乐部", about: "球队介绍",
    introductionOne: "YC&AC Pulse 建立在雄心、纪律与俱乐部精神之上。",
    introductionTwo: "YC&AC Pulse 汇聚了背景各异的球员，怀有共同的目标：竞争、进步，并自豪地代表 YC&AC。",
    introductionThree: "它不只是一支球队，更是追求足球、深厚情谊以及场内外持续成长的平台。",
    navSeason: "赛季", navStandings: "积分榜", navSchedule: "赛程",
    scheduleLink: "球队日程与活动报名", standingsLink: "TML 第三级联赛积分榜",
    clubLink: "YC&AC 俱乐部官网", standardSignup: "普通报名", prioritySignup: "YC&AC 优先",
    seasonStats: "赛季数据",
    footer: "YC&AC Pulse · 横浜乡村及体育俱乐部官方足球一线队",
    record: "战绩", goalsFor: "进球", goalsAgainst: "失球", cleanSheets: "零封",
    upcoming: "即将进行", fixtures: "下场比赛", kickoff: "开球", matchday: "赛季", results: "赛果",
    attack: "进攻", contributions: "进球贡献", availability: "出勤", attendance: "出场",
    player: "球员", position: "位置", attendanceRate: "出场率", summary: "汇总",
    searchPlayer: "搜索球员", swipeHint: "左右滑动查看各场比赛列。",
    starter: "首发", substitute: "替补", scored: "进球", cleanSheet: "零封（门将）",
    contact: "联系我们", contactTitle: "联系 YC&AC Pulse",
    contactCopy: "就赛程、活动或俱乐部事宜给我们留言。",
    name: "姓名", email: "邮箱", message: "留言", sendMessage: "发送留言",
    instagram: "Instagram", instagramTitle: "关注 YC&AC Pulse",
    instagramCopy: "比赛图集、球队新闻与球队瞬间。欢迎通过 Instagram 直接联系我们。",
    versus: "vs", goals: "进球", assists: "助攻", liveData: "实时数据", matchesRecorded: "场比赛已记录",
    unavailable: "当前无法加载数据", squadPicker: "阵容选择",
    pageTitle: "YC&AC Pulse | 官方球队网站", languageLabel: "语言",
    friendlyMatches: "友谊赛", wdl: "胜-平-负",
    recordAria: "{wins}胜 {draws}平 {losses}负", seasonEyebrow: "2026 赛季",
    vizEyebrow: "进球", vizTopScorers: "射手榜", vizTimeline: "赛果时间线",
    vizFriendly: "友谊赛", vizWin: "胜", vizDraw: "平", vizLoss: "负",
    pickerPageTitle: "YC&AC Pulse | 阵容选择",
    pickerTeam: "官方足球一线队", pickerBack: "返回赛季页", pickerTool: "比赛日工具",
    pickerTitle: "阵容<br /><em>选择</em>",
    pickerIntro: "排布首发十一人、检验阵容平衡，并分享球队名单。",
    pickerSelected: "/共选中 20 人", pickerEvent: "比赛", pickerFormation: "阵型",
    pickerSuggest: "生成阵容", pickerClear: "清空阵容", pickerCopy: "复制阵容",
    pickerImage: "保存阵容图", pickerStarting: "首发十一人", pickerBench: "替补席",
    pickerSubs: "/ 9 名替补", pickerAvailable: "可选球员", pickerPlayers: "球员",
    pickerSearch: "搜索球员", pickerSheet: "球队名单",
    pickerOutput: "选择的首发十一人将显示在这里。", pickerOpen: "空缺",
    pickerStartingOutput: "首发 XI", pickerSubsOutput: "替补", pickerRefreshBench: "刷新替补席",
    pickerDate: "日期", pickerOpponent: "对手", pickerCompetition: "赛事", pickerVenue: "场地",
    pickerKickoff: "开球", pickerSaveSquad: "保存阵容", pickerImageSaved: "阵容图已保存。",
    pickerArtStarting: "首发 XI", pickerArtSubs: "替补球员", pickerArtSubsShort: "替补",
    pickerArtStartingLong: "首发十一人", pickerArtBench: "替补席", pickerArtTeam: "官方足球一线队",
    pickerStatusPitch: "请在球场上选择一个位置，然后选择球员。",
    pickerStatusPickSlot: "请选择该 {role} 位置的球员。",
    pickerStatusFull: "20 人大名单已满，请选择位置进行替换。",
    pickerStatusAdded: "已将 {name} 加入比赛大名单。",
    pickerStatusConfirmed: "已加载确认报名的球员，请使用“生成阵容”或手动选择。",
    pickerStatusNoSignups: "暂无确认报名，请在 EventSignups 中添加确认的球员。",
    pickerStatusPast: "已加载记录的首发阵容，可按需调整。",
    pickerStatusSavedLoaded: "已加载保存的阵容，可按需调整。",
    pickerStatusNoEligible: "该场比赛暂无可选球员。",
    pickerStatusNeedXI: "请先选择首发 11 人再保存。",
    pickerStatusBenchRefreshed: "已从首发之外的球员中刷新替补席。",
    pickerSaving: "保存中…", pickerSaved: "已保存",
    pickerSaveSuccess: "阵容已保存到 Google Sheets。",
    pickerSaveFail: "保存失败，请重试。",
    pickerSubmitted: "阵容已提交至 Google Sheets。",
    pickerLoadFailed: "阵容数据加载失败，请重试。",
    pickerLoading: "加载中…",
    pickerNeedPlayers: "请先选择球员再保存图片。",
    pickerImageOpened: "图片已打开，请使用浏览器的保存或分享功能保存。",
    pickerImageFailed: "无法生成阵容图。",
    pickerShareOpened: "已打开分享菜单。",
    pickerImageCreated: "阵容图已生成，可下载或分享。",
    pickerDownloadImage: "下载图片", pickerClose: "关闭", pickerPreviewOpened: "阵容图预览已打开。",
    pickerNeedOnePlayer: "请至少选择一名球员后再保存图片。",
    pickerStatusSuggested: "已根据过往出场记录生成建议阵容，请检查并调整首发与替补。",
    pickerPngFailed: "PNG 转换失败，改用 SVG 导出。",
    pickerShareFailed: "分享失败，改为显示下载。",
    pickerCopied: "阵容已复制到剪贴板。",
    pickerCopyUnavailable: "当前浏览器不支持复制功能。",
    // login / auth (Phase 4)
    loginTitle: "登录 | YC&AC Pulse", loginHeading: "登录",
    loginTeamTitle: "球员与球队",
    loginTeamCopy: "供球员与工作人员使用 — 输入球队共享密码。",
    loginTeamLabel: "球队密码",
    loginCoachTitle: "教练",
    loginCoachCopy: "供教练与管理人员使用 — 使用你自己的账号登录。",
    loginEmail: "邮箱", loginPassword: "密码", authLogin: "登录",
    loginFailed: "登录失败 — 请检查输入内容后重试。",
    loginNeedCoach: "此页面需要教练账号，请使用下方教练登录。",
    loginSignedIn: "已登录",
    loginRoleCoach: "教练 — 完全权限", loginRoleTeam: "球队成员 — 仅查看",
    authLogout: "退出登录", loginContinue: "继续", loginHome: "返回赛季页",
    // coach dashboard (Phase 5)
    coachTitle: "教练仪表板 | YC&AC Pulse",
    coachEyebrow: "球队内部工具",
    coachHeading: "教练仪表板",
    coachIntro: "稳定阵容板、下场比赛报名、位置覆盖与待审标记 — 直接来自球队数据库。",
    coachPlayers: "球员", coachUsed: "已上场", coachMatches: "比赛",
    coachCompetition: "赛事",
    lensTml: "TML D3 联赛", lensFriendly: "友谊赛", lensAll: "全部比赛",
    coachNextFixture: "下一场比赛", coachNoFixture: "暂无后续赛程。",
    coachSignups: "报名情况", coachNoSignups: "该场比赛暂无报名记录。",
    coachResponded: "{total} 人中已回复 {count} 人",
    signupConfirmed: "确认参加", signupWaitlist: "候补", signupDeclined: "拒绝", signupUnavailable: "无法参加",
    coachBoard: "阵容板",
    tierCore: "核心", tierRotation: "轮换", tierDepth: "深度", tierInactive: "不活跃",
    shirtNumber: "号码", statApps: "出场", statStarts: "首发", statGoals: "进球", statAssists: "助攻", statReliability: "稳定度",
    coachCoverage: "位置覆盖",
    coachFlags: "待审标记",
    flagMissingPhotos: "缺少照片", flagDuplicateNumbers: "球衣号码重复",
    flagFriendlyOnly: "仅参加友谊赛", flagDeclinedButPlayed: "报了缺席却出场",
    flagNone: "无待处理项。",
    coachLoading: "正在加载球队数据…", coachError: "数据加载失败 — 请刷新重试。",
  };

  const dictionaries = { en, ja, zh };
  const listeners = [];

  // Squad-picker uses short key names (ui.team, ui.intro …); the shared dictionary
  // prefixes them (pickerTeam …) because e.g. "intro" already belongs to index.html.
  const PICKER_UI_KEYS = {
    team: "pickerTeam", back: "pickerBack", tool: "pickerTool", title: "pickerTitle", intro: "pickerIntro",
    selected: "pickerSelected", event: "pickerEvent", formation: "pickerFormation", suggest: "pickerSuggest",
    clear: "pickerClear", copy: "pickerCopy", image: "pickerImage", starting: "pickerStarting", bench: "pickerBench",
    subs: "pickerSubs", available: "pickerAvailable", players: "pickerPlayers", search: "pickerSearch",
    sheet: "pickerSheet", output: "pickerOutput", open: "pickerOpen", startingOutput: "pickerStartingOutput",
    subsOutput: "pickerSubsOutput",
  };
  const pickerUi = Object.fromEntries(Object.keys(dictionaries).map((code) => [
    code,
    Object.fromEntries(Object.entries(PICKER_UI_KEYS).map(([short, key]) => [short, dictionaries[code][key]])),
  ]));

  function normalise(code) {
    if (!code) return null;
    const lower = String(code).toLowerCase();
    if (lower === "zh" || lower.startsWith("zh-") || lower.startsWith("zh_") || lower === "cn") return "zh";
    if (lower.startsWith("ja") || lower.startsWith("jp")) return "ja";
    if (lower.startsWith("en")) return "en";
    return null;
  }

  function resolve() {
    if (typeof window === "undefined") return "en";
    const fromUrl = normalise(new URLSearchParams(window.location.search).get("lang"));
    if (fromUrl) return fromUrl;
    try {
      const saved = normalise(localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (error) { /* storage unavailable (private mode) — fall through */ }
    return "en";
  }

  let language = resolve();

  function t(key, vars) {
    const value = dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key;
    return vars ? value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match)) : value;
  }

  function apply(root) {
    if (typeof document === "undefined") return;
    const scope = root || document;
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    scope.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
    scope.querySelectorAll("[data-i18n-html]").forEach((element) => { element.innerHTML = t(element.dataset.i18nHtml); });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
    scope.querySelectorAll("[data-i18n-aria]").forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAria)); });
    const titleKey = document.documentElement.dataset.i18nTitle;
    if (titleKey) document.title = t(titleKey);
    scope.querySelectorAll("[data-lang-select]").forEach(mountSelect);
  }

  function mountSelect(select) {
    if (select.dataset.langReady !== "1") {
      select.innerHTML = Object.entries(LANGUAGES).map(([code, label]) => `<option value="${code}">${label}</option>`).join("");
      select.dataset.langReady = "1";
      select.addEventListener("change", () => setLanguage(select.value));
      const label = select.closest("label");
      if (label) label.setAttribute("aria-label", t("languageLabel"));
    }
    select.value = language;
  }

  function setLanguage(code) {
    const next = normalise(code);
    if (!next) return;
    language = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (error) { /* ignore */ }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(null, "", url);
    }
    apply(document);
    listeners.forEach((listener) => listener(language));
  }

  function onChange(listener) { listeners.push(listener); }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat(LOCALES[language], { day: "numeric", month: "short", year: "numeric" })
      .format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
  }

  const api = { LANGUAGES, dictionaries, t, apply, setLanguage, onChange, formatDate, get language() { return language; }, ui: pickerUi };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply(document));
    else apply(document);
  }
  if (typeof window !== "undefined") window.YCACI18n = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
