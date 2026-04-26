import {
  ARCHETYPE_LABELS,
  type Archetype,
  type DetectionSource,
  type ConfidenceBand,
  getConfidenceBand,
} from "../shared/constants";

export type { Archetype } from "../shared/constants";
export { getArchetypeLabel } from "../shared/constants";

export interface PatternMatch {
  label: string;
  text: string;
  index: number;
  weight: number;
  source?: DetectionSource;
}

export interface ClassificationResult {
  archetype: Archetype;
  confidence: number;
  aiScore: number;
  aiBand: ConfidenceBand;
  aiBandLabel: string;
  detectedPatterns: string[];
  aiSignals: string[];
  matches: PatternMatch[];
  isHardEngagementFarming: boolean;
  needsApiConfirmation: boolean;
  isComment?: boolean;
  detectionSources: DetectionSource[];
  llmReason?: string;
}

export interface AIScoreResult {
  score: number;
  patterns: string[];
  matches: PatternMatch[];
  needsAPIConfirmation: boolean;
  sources: DetectionSource[];
}

interface ScoreBundle {
  score: number;
  patterns: string[];
  matches: PatternMatch[];
}

function runChecks(text: string, checks: ReadonlyArray<readonly [RegExp, string, number]>): ScoreBundle {
  const patterns: string[] = [];
  const matches: PatternMatch[] = [];
  let score = 0;
  for (const [regex, label, weight] of checks) {
    const match = regex.exec(text);
    if (match) {
      patterns.push(label);
      matches.push({ label, text: match[0], index: match.index, weight });
      score += weight;
    }
  }
  return { score, patterns, matches };
}

function scoreFailureLaundering(text: string): ScoreBundle {
  const checks: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/sustainable (growth|returns|profitability)/i, "Sustainable growth framing", 18],
    [/stepping back/i, "Stepping back euphemism", 18],
    [/team announcement/i, '"Team announcement" header', 20],
    [/right.?sizing/i, "Right-sizing language", 22],
    [/parting ways/i, "Parting ways language", 20],
    [/restructuring/i, "Restructuring language", 15],
    [/pivoting to (our )?core/i, "Pivoting to core", 15],
    [/runway optimization/i, "Runway optimization language", 22],
    [/exciting new chapter/i, "Exciting next chapter framing", 15],
    [/lessons? learned/i, "Lessons learned framing", 10],
    [/incredible journey/i, "Incredible journey framing", 12],
    [/explore (new )?(opportunities|what's next)/i, "Exploring opportunities framing", 18],
    [/difficult decision/i, "Difficult decision language", 12],
    [/grateful for (the |this )?experience/i, "Grateful for the experience", 15],
    [/making some changes to the team/i, "Team changes euphemism", 22],
    [/wind(ing)? down/i, "Winding down", 22],
    [/reduce(d)? (our )?(team|headcount|workforce)/i, "Workforce reduction", 22],
    [/profitability.{1,30}focus/i, "Profitability focus pivot", 18],
    [/(announced|sharing) (today|this) (that )?i'?m? (leaving|stepping|moving)/i, "Departure announcement", 18],
    [/next chapter/i, "Next chapter framing", 10],
  ];

  const result = runChecks(text, checks);
  if (result.score > 15 && !/\d+%|\$\d+|\d+ (employee|team member|staff|person)/i.test(text)) {
    result.patterns.push("No specific numbers disclosed");
    result.score += 10;
  }

  return { ...result, score: Math.min(result.score, 100) };
}

function scoreEngagementFarming(text: string): ScoreBundle & { isHard: boolean } {
  const hardChecks: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/comment ['"]?1['"]?\s*(and|for|if|to)/i, '"Comment 1" CTA', 50],
    [/drop a .{1,10}(emoji|reaction)?.{0,10}(in the comments|below|if)/i, "Emoji CTA in comments", 45],
    [/(dm me|message me) (for|if|your|the)/i, "DM farming CTA", 45],
    [/save this post/i, '"Save this post" CTA', 40],
    [/repost (this|if you)/i, "Repost farming", 40],
    [/tag (a |someone|your)/i, "Tag someone CTA", 38],
    [/comment (below|down|here|yes|no).{0,30}(to get|for|if you want)/i, "Comment for resource CTA", 45],
    [/type ['"]?(yes|interested|1|want|me)['"]? (if|for|to|below)/i, "Keyword comment farming", 48],
    [/i'?ll (send|dm|share).{1,30}(comment|reply|message me)/i, "DM-for-resource pattern", 45],
  ];

  const softChecks: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/i almost didn'?t (post|share|write) this/i, '"I almost didn\'t post this" opener', 30],
    [/agree or disagree\??/i, '"Agree or disagree?" hook', 25],
    [/hot take:/i, '"Hot take:" opener', 20],
    [/more (soon|coming|details|later)/i, "Withheld information hook", 22],
    [/follow (me |for more|along)/i, "Follow CTA", 18],
    [/what do you think\??/i, '"What do you think?" closer', 12],
    [/let me know (what|how|in the)/i, '"Let me know" engagement ask', 12],
    [/share (this |your |if )/i, "Share ask", 15],
    [/leaving this here/i, "Passive engagement bait", 15],
    [/controversial (opinion|take|post)/i, "Manufactured controversy hook", 25],
    [/had (a |the |an )?(most )?(incredible|amazing|life-changing) (conversation|meeting|call)/i, "Withheld name-drop", 25],
    [/you won'?t believe/i, "Clickbait opening", 28],
    [/this is (the|a) (game.changer|secret|truth|thing nobody|reason why)/i, "Clickbait pattern", 25],
    [/\d+ (things|ways|tips|lessons|reasons|mistakes|rules|secrets|steps|hacks)/i, "Listicle bait title", 18],
  ];

  const hard = runChecks(text, hardChecks);
  const soft = runChecks(text, softChecks);

  return {
    score: Math.min(hard.score + soft.score, 100),
    patterns: [...hard.patterns, ...soft.patterns],
    matches: [...hard.matches, ...soft.matches],
    isHard: hard.matches.length > 0,
  };
}

function scoreStatusPackaging(text: string): ScoreBundle {
  const checks: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/humbled (to|by)/i, '"Humbled to" opener', 22],
    [/honored to (be|share|announce|receive|join|speak)/i, '"Honored to" language', 22],
    [/thrilled to (share|announce|join)/i, '"Thrilled to" language', 18],
    [/still processing/i, '"Still processing" performance', 20],
    [/this one's for (everyone|all)/i, "Dedication deflection", 18],
    [/grateful to .{1,50} for the (kind words|opportunity|intro|support)/i, "Soft name-drop with gratitude", 25],
    [/had (a |an )?(incredible|amazing|fascinating|wonderful) (conversation|chat|call|meeting|lunch|dinner) with/i, "High-status conversation drop", 25],
    [/excited (to announce|to share|to join|to be)/i, '"Excited to" announcement', 15],
    [/i almost didn'?t apply/i, "False modesty gate", 20],
    [/didn'?t (think|expect|believe) (i'?d|i would|we'?d) (make it|get (this|in|it|selected))/i, "False modesty", 20],
    [/named (to|as|a) .{1,40}(list|award|fellow|speaker|top|best)/i, "Award/list announcement", 25],
    [/featured (in|on|by)/i, "Press mention", 20],
    [/covered (in|on|by)/i, "Press coverage", 20],
    [/spoke (at|to|with)/i, "Speaking engagement flex", 18],
    [/(forbes|techcrunch|wired|wsj|nyt|harvard|mit|stanford)/i, "Prestigious institution name-drop", 15],
    [/to the team (that|who) made this/i, "Team acknowledgment deflection", 15],
  ];

  const result = runChecks(text, checks);
  return { ...result, score: Math.min(result.score, 100) };
}

function scoreConsensusWisdom(text: string): ScoreBundle {
  const checks: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/your network is your net worth/i, "Classic LinkedIn platitude", 45],
    [/work (smarter|harder), not (harder|smarter)/i, "Work smarter/harder cliche", 40],
    [/success is (not |a )?journey/i, "Success is a journey", 40],
    [/best (investment|time to) (you|plant|start)/i, "Investment platitude", 35],
    [/if you'?re not growing,? you'?re dying/i, "Grow or die platitude", 45],
    [/protect your (energy|peace|time)/i, "Energy protection cliche", 30],
    [/real leaders (don'?t|create|inspire)/i, "Leadership cliche", 30],
    [/wake (up |at )?(4|5|6)?\s*a\.?m/i, "4am hustle gospel", 35],
    [/sleep is for (the weak|losers|slackers)/i, "Sleep deprivation hustle gospel", 40],
    [/monday (motivation|mindset|mood)/i, "Monday motivation tag", 35],
    [/#(mondaymotivation|motivationmonday|mondaymindset)/i, "Monday motivation hashtag", 35],
    [/opportunities (don'?t|don't) (come|wait|happen)/i, "Opportunity platitude", 30],
    [/mindset (is|determines|shifts?)/i, "Mindset as solution", 20],
    [/you (have to|must|need to) believe/i, "Belief as prescription", 20],
    [/hustle (is|never|every day)/i, "Hustle culture gospel", 28],
    [/(consistency|discipline|focus) (is|are|beats|wins?)/i, "Virtue-as-solution platitude", 20],
    [/(the secret|the key|one thing) to (success|happiness|greatness|wealth)/i, "Secret/key to success", 28],
  ];

  const result = runChecks(text, checks);

  const words = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const properNounCount = (text.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter(
    (w) =>
      ![
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
        "LinkedIn", "I",
      ].includes(w)
  ).length;

  if (words.length < 150 && sentences.length > 0 && properNounCount < 2 && result.score > 0) {
    result.patterns.push("Short post with no specific context or actors");
    result.score += 15;
  }

  return { ...result, score: Math.min(result.score, 100) };
}

function computeAIScore(text: string): AIScoreResult {
  // Layer A: vocabulary — single-word AI signature
  const layerA: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/\bdelve\b/i, '"delve" (AI signature word)', 18],
    [/\btapestry\b/i, '"tapestry" (AI signature word)', 18],
    [/\bkaleidoscope\b/i, '"kaleidoscope" (AI word)', 18],
    [/\bnuanced\b/i, '"nuanced" (overused AI word)', 12],
    [/\bmultifaceted\b/i, '"multifaceted" (AI word)', 14],
    [/\bunderscore\b/i, '"underscore" as verb (AI tell)', 12],
    [/\bpivotal\b/i, '"pivotal" (AI filler)', 10],
    [/\bembark\b/i, '"embark" (AI language)', 14],
    [/in the realm of/i, '"in the realm of" (AI phrase)', 14],
    [/\bfostering\b/i, '"fostering" (AI word)', 10],
    [/in today'?s .{0,30} landscape/i, "Landscape opener (AI template)", 18],
    [/\bcertainly\b/i, '"certainly" (AI adverb)', 8],
    [/\bseamlessly\b/i, '"seamlessly" (AI adverb)', 10],
    [/\binherent(ly)?\b/i, '"inherently" (AI adverb)', 8],
    [/\bundeniably\b/i, '"undeniably" (AI adverb)', 8],
    [/\bprofoundly\b/i, '"profoundly" (AI adverb)', 8],
    [/\btransformative\b/i, '"transformative" (AI vocabulary)', 8],
    [/\bparadigm shift\b/i, '"paradigm shift" (AI vocabulary)', 10],
    [/\b(leverage|leveraging)\b/i, '"leverage" (corporate AI vocabulary)', 6],
    [/\bempower\b/i, '"empower" (AI vocabulary)', 6],
    [/\bunlock\b/i, '"unlock" potential (AI vocabulary)', 5],
    [/\brobust\b/i, '"robust" (AI vocabulary)', 5],
    [/game.?changer/i, '"game-changer" (AI vocabulary)', 7],
    [/it'?s worth (noting|mentioning)/i, '"It\'s worth noting" (AI filler)', 12],
    [/it bears (noting|mentioning)/i, '"It bears mentioning" (AI filler)', 12],
    [/\b(meticulously|painstakingly|elegantly|gracefully)\b/i, "AI adverb cluster", 8],
    [/\b(plethora|myriad|cornucopia|smorgasbord)\b/i, "AI quantity word", 12],
    [/\b(synergize|synergy|synergistic)\b/i, "Synergy AI vocabulary", 10],
    [/\b(holistic|holistically)\b/i, '"holistic" (AI vocabulary)', 8],
    [/\b(actionable insights?|actionable takeaways?)\b/i, '"actionable insights" template phrase', 14],
    [/\bnavigate (the|this) (complex|complexity|landscape|terrain|nuances?)/i, '"navigate the complexity" template', 14],
    [/at the (intersection|forefront|core|heart) of/i, '"at the intersection of" template', 12],
    [/\bcrucial\b/i, '"crucial" (AI hedging)', 6],
    [/\bvital\b/i, '"vital" (AI hedging)', 6],
    [/\bessential\b/i, '"essential" (AI hedging)', 5],
    [/\bcomprehensive\b/i, '"comprehensive" (AI vocabulary)', 6],
    [/\bsophisticated\b/i, '"sophisticated" (AI vocabulary)', 6],
    [/\b(unprecedented|unparalleled|unmatched)\b/i, "AI superlative", 8],
  ];

  // Layer B: structural tells from tropes.fyi
  const layerB: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/[Ii]t'?s not .{3,40}[—\-\u2014\.].{3,40}[Ii]t'?s/i, "Negative parallelism (AI #1 tell)", 22],
    [/[Ii]t'?s not (just |only |simply |merely )?(about |that )?\w+[.,]\s+[Ii]t'?s/i, "Negative parallelism (period form)", 20],
    [/[Hh]ere'?s (the (thing|kicker|deal|truth|catch|irony|reality|secret)|where it gets|what most people|why)/i, '"Here\'s the kicker" family', 16],
    [/[Ll]et'?s (break (this|it) down|unpack|dive in|dig into|explore this)/i, 'Pedagogical "let\'s" voice', 14],
    [/[Ii]n today'?s (fast.?paced|rapidly evolving|competitive|digital|changing|complex|interconnected) (landscape|world|environment|economy|market)/i, "Landscape opener template", 20],
    [/[Ii]t'?s not just about .{5,50}[—\-\u2014\.].{3,50}[Ii]t'?s (also )?about/i, "Pivot construction", 16],
    [/[Ii]magine (a world|if|when) (where|you|we)/i, 'AI "Imagine" invitation', 14],
    [/[Ii]'?ve been (thinking|reflecting|pondering) (a lot )?(about|on)/i, '"I\'ve been thinking" opener', 14],
    [/^[Ii]n (conclusion|summary|closing)/im, "Signposted conclusion", 16],
    [/[Nn]ot \w+[.,]?\s+[Nn]ot \w+[.,]?\s+(Just|Only|Simply|But|Pure|Real)\s/i, "Triple negation reveal", 18],
    [/[Ff]undamentally reshape|redefine (how|what)|at an inflection point/i, "Grandiose stakes inflation", 14],
    [/[Dd]espite (its|these|those|the) (challenges|obstacles|difficulties|limitations|complexities)/i, '"Despite its challenges" formula', 12],
    [/[Ee]xperts (say|argue|suggest|claim)(?! .{1,30}(dr\.|prof\.|[A-Z][a-z]+ [A-Z][a-z]+))/i, "Vague attribution", 12],
    [/[Rr]esearch shows(?! .{1,30}(journal|university|[A-Z]))/i, "Unattributed research claim", 12],
    [/[Ss]tudies (suggest|indicate|show)(?! .{1,30}(published|journal))/i, "Vague study attribution", 12],
    [/[Ii]n this (post|thread|article),? I('?ll| will) (cover|explore|share)/i, "Fractal summary opener", 14],
    [/(serves|stands|marks|functions|operates) as (a|an|the) /i, '"Serves as" dodge', 12],
    [/[Tt]hink of (it|this) (as|like)/i, "Patronizing analogy mode", 10],
    [/[Mm]aybe the \w+ isn'?t .{3,30}[—\-\u2014\.].{3,30}it'?s/i, "Philosophical aphorism (AI form)", 16],
    [/[Mm]ost (people|companies|leaders|teams) .{5,60}(successful|winners|top \d+%|few|best) .{0,40}(do|are|have|know)/i, "False dichotomy", 14],
    // The reframe: "The question isn't X. The question is Y."
    [/[Tt]he (question|issue|problem|point|truth) (isn'?t|is not) .{3,60}[\.\?]\s*[Tt]he \1 is/i, '"The question isn\'t X" reframe', 20],
    // Fragment reveal: "The result? Devastating." / "The fix? Simple."
    [/[A-Z]\w+ (result|fix|answer|catch|truth|reality|kicker|problem|reason)\?\s+[A-Z]\w+\.?/, "Fragment reveal pattern", 16],
    // False urgency
    [/[Nn]ow,? more than ever/i, '"Now, more than ever" false urgency', 16],
    [/[Ii]n a world where/i, '"In a world where" false urgency', 14],
    // Performed humility
    [/[Ii]'?m (just |only )?(one person|a \w+, but|no expert)/i, "Performed humility opener", 14],
    [/[Tt]ake this with a grain of salt/i, "Performed humility hedge", 12],
    // Ending CTA frame
    [/[Aa]gree\?\s+[Dd]isagree\?/i, '"Agree? Disagree?" closer', 14],
    // Conclusion-as-revelation
    [/[Tt]he (lesson|takeaway|truth|reality|insight) here is/i, "Conclusion-as-revelation", 12],
    // Anaphora setup ("X is Y. X is Z. X is W." captured statistically below)
    [/[Tt]his (isn'?t|is not) (a |an |just )?\w+\.\s+[Tt]his is/i, "Anaphora reveal", 14],
  ];

  const a = runChecks(text, layerA);
  const b = runChecks(text, layerB);
  let score = a.score + b.score;
  const patterns = [...a.patterns, ...b.patterns];
  const matches = [...a.matches, ...b.matches];
  const sources = new Set<DetectionSource>();
  if (a.matches.length > 0 || b.matches.length > 0) sources.add("regex");

  // Layer C: statistical detectors
  const stats = computeStatisticalSignals(text);
  score += stats.score;
  patterns.push(...stats.patterns);
  matches.push(...stats.matches);
  if (stats.matches.length > 0) sources.add("stats");

  const finalScore = Math.min(Math.round(score), 100);
  const needsAPIConfirmation = finalScore >= 35 && finalScore <= 75;

  return {
    score: finalScore,
    patterns: patterns.slice(0, 8),
    matches,
    needsAPIConfirmation,
    sources: Array.from(sources),
  };
}

const COMMON_FIRST_WORDS = new Set([
  "i", "the", "a", "an", "and", "but", "so", "we", "you", "they", "it", "this", "that",
]);

const PROPER_NOUN_STOPWORDS = new Set([
  "I", "I'm", "I've", "LinkedIn", "The", "This", "That", "These", "Those",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);

function computeStatisticalSignals(text: string): ScoreBundle {
  const patterns: string[] = [];
  const matches: PatternMatch[] = [];
  let score = 0;

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 3);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Burstiness: low sentence-length variance is an AI tell
  if (sentences.length >= 4) {
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const avg = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
    const variance = lengths.reduce((sum, n) => sum + Math.pow(n - avg, 2), 0) / lengths.length;
    if (variance < 8 && avg < 20) {
      patterns.push("Uniform sentence length (low burstiness)");
      matches.push({ label: "Uniform sentence length", text: "", index: 0, weight: 15, source: "stats" });
      score += 15;
    } else if (variance < 4) {
      patterns.push("Mechanical sentence rhythm");
      matches.push({ label: "Mechanical sentence rhythm", text: "", index: 0, weight: 18, source: "stats" });
      score += 18;
    }
  }

  // Lexical diversity: type-token ratio over a moving window
  if (wordCount >= 60) {
    const lower = words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean);
    const ttr = new Set(lower).size / Math.max(lower.length, 1);
    if (ttr > 0.78 && wordCount < 250) {
      // Suspiciously high diversity in short text — every word a synonym
      patterns.push("Inflated lexical diversity (AI synonym sprawl)");
      matches.push({ label: "Inflated lexical diversity", text: "", index: 0, weight: 10, source: "stats" });
      score += 10;
    }
  }

  // Proper noun density
  const properNouns = (text.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter(
    (w) => !PROPER_NOUN_STOPWORDS.has(w),
  );
  const properNounDensity = properNouns.length / Math.max(wordCount, 1);
  if (properNounDensity < 0.02 && wordCount > 50) {
    patterns.push("Near-zero proper noun density");
    matches.push({ label: "Near-zero proper noun density", text: "", index: 0, weight: 15, source: "stats" });
    score += 15;
  }

  // One-sentence-per-line formatting
  const lineBreaks = (text.match(/\n/g) || []).length;
  const lineBreakRatio = lineBreaks / Math.max(wordCount, 1);
  if (lineBreakRatio > 0.2 && lineBreaks > 8) {
    patterns.push("One-sentence-per-line formatting");
    matches.push({ label: "One-sentence-per-line formatting", text: "", index: 0, weight: 12, source: "stats" });
    score += 12;
  }

  // Em-dash overuse
  const emDashes = (text.match(/[—\u2014]/g) || []).length;
  if (emDashes > 4) {
    patterns.push("Em-dash overuse");
    matches.push({ label: "Em-dash overuse", text: "—", index: text.indexOf("—"), weight: 10, source: "stats" });
    score += 10;
  } else if (emDashes > 2 && wordCount < 200) {
    patterns.push("Em-dash density (short post)");
    matches.push({ label: "Em-dash density", text: "—", index: text.indexOf("—"), weight: 6, source: "stats" });
    score += 6;
  }

  // Anaphora abuse: 3+ consecutive sentences starting with same word
  if (sentences.length >= 3) {
    const firstWords = sentences.map((s) => s.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, "") || "");
    let runStart = 0;
    let runWord = firstWords[0];
    let maxRun = 1;
    let maxRunWord = runWord;
    for (let i = 1; i < firstWords.length; i++) {
      if (firstWords[i] && firstWords[i] === runWord) {
        const runLen = i - runStart + 1;
        if (runLen > maxRun) {
          maxRun = runLen;
          maxRunWord = runWord;
        }
      } else {
        runStart = i;
        runWord = firstWords[i];
      }
    }
    if (maxRun >= 3 && !COMMON_FIRST_WORDS.has(maxRunWord)) {
      patterns.push(`Anaphora abuse ("${maxRunWord}" repeated ${maxRun}x)`);
      matches.push({ label: "Anaphora abuse", text: maxRunWord, index: text.toLowerCase().indexOf(maxRunWord), weight: 14, source: "stats" });
      score += 14;
    } else if (maxRun >= 4) {
      patterns.push(`Anaphora abuse ("${maxRunWord}" repeated ${maxRun}x)`);
      matches.push({ label: "Anaphora abuse", text: maxRunWord, index: text.toLowerCase().indexOf(maxRunWord), weight: 10, source: "stats" });
      score += 10;
    }
  }

  // Invented concept labels: 2-3 word capitalized phrases that aren't real proper nouns
  const conceptLabelRegex = /\b([A-Z][a-z]+ (?:of |the )?[A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/g;
  const conceptMatches: string[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = conceptLabelRegex.exec(text)) !== null) {
    const phrase = cm[1];
    // Filter out obvious real proper nouns: people names, company names with common patterns
    if (
      !/(Inc|LLC|Corp|Ltd|GmbH|AG|SA)\.?$/.test(phrase) &&
      !PROPER_NOUN_STOPWORDS.has(phrase.split(" ")[0]) &&
      phrase.split(" ").every((w) => w.length >= 3)
    ) {
      conceptMatches.push(phrase);
    }
  }
  if (conceptMatches.length >= 2) {
    patterns.push(`Invented concept labels (${conceptMatches.slice(0, 2).join(", ")})`);
    matches.push({
      label: "Invented concept labels",
      text: conceptMatches[0],
      index: text.indexOf(conceptMatches[0]),
      weight: 16,
      source: "stats",
    });
    score += 16;
  }

  // Closing CTA question
  const closingQuestion = /[\.!?]\s*(what do you think|drop a comment|let me know what you think|thoughts\?)\s*$/i;
  if (closingQuestion.test(text)) {
    patterns.push("AI-style closing engagement question");
    matches.push({ label: "Closing engagement question", text: "", index: text.length - 1, weight: 8, source: "stats" });
    score += 8;
  }

  // Perfect parallel structure: 3+ short clauses joined by commas with similar word count
  const clausePattern = /(\b\w+ \w+ \w+\b)(,\s+\w+ \w+ \w+\b){2,}/;
  if (clausePattern.test(text)) {
    patterns.push("Tricolon / parallel structure");
    const m = text.match(clausePattern);
    if (m) {
      matches.push({ label: "Parallel structure", text: m[0], index: text.indexOf(m[0]), weight: 8, source: "stats" });
    }
    score += 8;
  }

  return { score, patterns, matches };
}

/**
 * Apply a local LLM judgment to an existing classification.
 * The LLM is treated as a confidence boost (not a replacement) to keep
 * the regex/stats patterns visible to the user. The blend leans toward
 * the LLM only when it strongly agrees or disagrees.
 */
export function applyLocalLLMJudgment(
  result: ClassificationResult,
  llmScore: number,
  llmReason: string,
): ClassificationResult {
  const blended = Math.round(result.aiScore * 0.45 + llmScore * 0.55);
  const finalScore = Math.max(0, Math.min(100, blended));
  const band = getConfidenceBand(finalScore);
  const sources = new Set<DetectionSource>(result.detectionSources);
  sources.add("local-llm");

  return {
    ...result,
    aiScore: finalScore,
    aiBand: band.band,
    aiBandLabel: band.label,
    detectionSources: Array.from(sources),
    llmReason,
  };
}

function isHardEngagementFarmingPost(text: string): boolean {
  const hardPatterns = [
    /comment ['"]?1['"]?\s*(and|for|if|to)/i,
    /(dm me|message me) (for|if|your|the)/i,
    /save this post/i,
    /repost (this|if you)/i,
    /type ['"]?(yes|interested|1|want|me)['"]? (if|for|to|below)/i,
    /i'?ll (send|dm|share).{1,30}(comment|reply|message me)/i,
    /drop a .{1,5} (in the comments|below|if you)/i,
    /comment (below|down|here|yes|no).{0,30}(to get|for|if you want)/i,
  ];
  return hardPatterns.some((p) => p.test(text));
}

export function classifyPost(text: string): ClassificationResult {
  const fl = scoreFailureLaundering(text);
  const ef = scoreEngagementFarming(text);
  const sp = scoreStatusPackaging(text);
  const aiSludge = computeAIScore(text);
  const cw = scoreConsensusWisdom(text);

  const aiSludgeScore = aiSludge.score >= 55 ? aiSludge.score : Math.max(0, aiSludge.score - 10);

  const scoreMap: Record<Archetype, ScoreBundle | (ScoreBundle & { isHard?: boolean })> = {
    "failure-laundering": fl,
    "engagement-farming": ef,
    "status-packaging": sp,
    "ai-sludge": { score: aiSludgeScore, patterns: aiSludge.patterns, matches: aiSludge.matches },
    "consensus-wisdom": cw,
  };

  const ranked = (Object.entries(scoreMap) as [Archetype, ScoreBundle][]).sort(
    (a, b) => b[1].score - a[1].score
  );
  const [archetype, winner] = ranked[0];
  const band = getConfidenceBand(aiSludge.score);

  return {
    archetype,
    confidence: Math.min(winner.score, 100),
    aiScore: aiSludge.score,
    aiBand: band.band,
    aiBandLabel: band.label,
    detectedPatterns: winner.patterns.slice(0, 4),
    aiSignals: aiSludge.patterns.slice(0, 4),
    matches: winner.matches.slice(0, 8),
    isHardEngagementFarming: isHardEngagementFarmingPost(text),
    needsApiConfirmation: aiSludge.needsAPIConfirmation,
    detectionSources: aiSludge.sources,
  };
}

export function classifyComment(text: string): {
  isAIGenerated: boolean;
  confidence: number;
  patterns: string[];
  archetype: Archetype;
  archetypeLabel: string;
} {
  const commentChecks: ReadonlyArray<readonly [RegExp, string, number]> = [
    [/[Nn]ot just .{3,30}, but (the )?\w+/i, '"Not just X, but Y" construction', 22],
    [/[Tt]he gap between .+ and .+ is (where|what)/i, "Gap construction", 22],
    [/[Tt]he real question (is|isn'?t whether)/i, '"The real question is" pivot', 20],
    [/[Ee]veryone'?s focused on.{0,50}(what'?s more|more interesting)/i, '"What\'s more interesting" dismissal', 22],
    [/[Mm]aybe (the )?\w+ isn'?t .{3,30}[—\-\u2014].{3,30}it'?s/i, "Philosophical aphorism drop", 22],
    [/[Cc]urious (how|what|where|whether)/i, "Curious closing question", 16],
    [/[Hh]ow do you (see|think about)/i, "Engagement question closer", 14],
    [/^(Great (point|post|share|insight)|Really interesting|Love this|So (well|true|spot on))/i, "Hollow validation opener", 20],
    [/[Tt]his is exactly why/i, '"This is exactly why" false authority', 18],
    [/[Ww]hat (this really|it really) (points? to|highlights?|shows?) is/i, "Zoom-out reframe", 20],
    [/[Tt]he broader (question|issue|point|context) here is/i, "Zoom-out reframe", 20],
    [/[Ff]ascinating (perspective|take|angle|read)/i, "AI comment opener", 14],
    [/[Ww]ell said\.?\s*[A-Z]/i, "Hollow praise opener", 12],
    [/[Ii]'?d (also )?(argue|add|suggest) that/i, "AI comment contribution formula", 14],
    [/[Yy]ou'?ve (touched on|highlighted|articulated) (something|an important|a key)/i, "AI compliment formula", 14],
  ];

  const result = runChecks(text, commentChecks);
  const postResult = classifyPost(text);

  return {
    isAIGenerated: result.score >= 30,
    confidence: Math.min(result.score, 100),
    patterns: result.patterns.slice(0, 3),
    archetype: postResult.archetype,
    archetypeLabel: ARCHETYPE_LABELS[postResult.archetype],
  };
}
