// Festival Content Data
const festivalContent = [
  {
    title: "Empathy Creatures",
    tags: ["SENSORY_WELLNESS", "VR_EXPERIENCE"],
    score: 0,
  },
  {
    title: "A Song Within Us",
    tags: ["ART_CULTURE", "VR_EXPERIENCE"],
    score: 0,
  },
  { title: "The Eye and I", tags: ["SOCIETY_TECH", "VR_EXPERIENCE"], score: 0 },
  { title: "Épanouir", tags: ["SENSORY_WELLNESS", "VR_EXPERIENCE"], score: 0 },
  { title: "Care", tags: ["SENSORY_WELLNESS", "AR_STAND"], score: 0 },
  { title: "Jailbirds", tags: ["SOCIETY_TECH", "CREATOR_TALK"], score: 0 },
  { title: "Mandala", tags: ["TECH_DISCOVERY", "AR_STAND"], score: 0 },
  {
    title: "Mechanical Souls",
    tags: ["SOCIETY_TECH", "VR_EXPERIENCE"],
    score: 0,
  },
];

// Categories
const categories = {
  SENSORY_WELLNESS: {
    description:
      "Sensory & Wellness Experiences (relaxation, mindfulness, wellbeing)",
    icon: "🧘",
  },
  ART_CULTURE: {
    description: "Art & Culture (creative, artistic expressions)",
    icon: "🎨",
  },
  SOCIETY_TECH: {
    description: "Society & Technology (social impact, tech discovery)",
    icon: "🌐",
  },
  TECH_DISCOVERY: {
    description: "Technology Discovery (innovation, interactive technology)",
    icon: "🔬",
  },
};

const categoryColor = {
  SENSORY_WELLNESS: "var(--teal)",
  ART_CULTURE: "var(--magenta)",
  SOCIETY_TECH: "var(--violet)",
  TECH_DISCOVERY: "var(--amber)",
};

const ratingLabels = [
  "",
  "Curious",
  "Interested",
  "Into it",
  "Excited",
  "Obsessed",
];

let currentQuestionIndex = 0;
let userRatings = {};
let selectedCategories = [];
let usersMap = {}; // id -> { role, preferred_tags }
let bookingsMap = {}; // user_id -> [booked titles]
let notifRows = []; // raw notification rows parsed from CSV
let wishRows = []; // raw wishlist rows
let usersRows = []; // raw users rows
let currentUserId = "";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// ============================================
// Init
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  Object.keys(categories).forEach((cat) => {
    userRatings[cat] = 0;
  });
  initTheme();
  initSpotlight();
  initMagnetic();
  loadMocks();
});

// ============================================
// Theme toggle
// ============================================
function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const isDark =
    current === "dark" ||
    (!current && !window.matchMedia("(prefers-color-scheme: light)").matches);
  const next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

// ============================================
// Spotlight cursor glow on the card
// ============================================
function initSpotlight() {
  if (prefersReducedMotion) return;
  const card = document.getElementById("app-card");
  if (!card) return;
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--mx", mx + "%");
    card.style.setProperty("--my", my + "%");
    card.classList.add("spotlight-on");
  });
  card.addEventListener("mouseleave", () =>
    card.classList.remove("spotlight-on"),
  );
}

// ============================================
// Magnetic buttons
// ============================================
function initMagnetic() {
  if (prefersReducedMotion) return;
  document.querySelectorAll(".magnetic").forEach((wrap) => {
    const btn = wrap.querySelector(".btn");
    if (!btn) return;
    wrap.addEventListener("mousemove", (e) => {
      const rect = wrap.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.25;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.35;
      btn.style.transform = `translate(${x}px, ${y}px)`;
    });
    wrap.addEventListener("mouseleave", () => {
      btn.style.transform = "";
    });
  });
}

// ============================================
// Flow control
// ============================================

// --- CSV parsing + mock loading ---
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    if (parts.length === 0) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = parts[j] || "";
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function loadMocks() {
  // Try to fetch users and notifications CSVs from same folder
  fetch("users_rows_mock.csv")
    .then((r) => r.text())
    .then((text) => {
      const rows = parseCSV(text);
      usersRows = rows;
      rows.forEach((r) => {
        try {
          const tags = JSON.parse(r.preferred_tags || "[]");
          usersMap[r.id] = { role: r.role, preferred_tags: tags };
        } catch (e) {
          usersMap[r.id] = { role: r.role, preferred_tags: [] };
        }
      });
    })
    .catch((_) => {
      /* ignore if not available when served via file:// */
    });

  fetch("notifications_rows_mock.csv")
    .then((r) => r.text())
    .then((text) => {
      const rows = parseCSV(text);
      notifRows = rows;
      rows.forEach((r) => {
        if ((r.type || "").toLowerCase() === "booking") {
          try {
            const data = JSON.parse(r.data || "{}");
            const title = data.content_title || data.title || null;
            if (!title) return;
            if (!bookingsMap[r.user_id]) bookingsMap[r.user_id] = [];
            bookingsMap[r.user_id].push(title);
          } catch (e) {
            /* ignore malformed */
          }
        }
      });
    })
    .catch((_) => {
      /* ignore */
    });

  fetch("wishlist_rows_mock.csv")
    .then((r) => r.text())
    .then((text) => {
      const rows = parseCSV(text);
      wishRows = rows;
    })
    .catch((_) => {
      /* ignore */
    });
}

function prefillSampleUser() {
  // pick a random user id from usersMap
  const ids = Object.keys(usersMap);
  if (ids.length === 0) return;
  const idx = Math.floor(Math.random() * ids.length);
  const sample = ids[idx];
  const input = document.getElementById("user-id-input");
  if (input) {
    input.value = sample;
    input.dispatchEvent(new Event("input"));
  }
}

function startQuestions() {
  // Ask for user id first before showing category questions
  showStep("user-step");
}

function formatRuleBadge(ruleStr) {
  if (!ruleStr) return "";
  let label = ruleStr;
  let type = "positive";

  if (ruleStr.includes("MUST_BOOK_BOOST")) {
    const match = ruleStr.match(/\+(\d+)/);
    const pts = match ? ` +${match[1]}` : " +150";
    label = `⭐ JURY MUST-BOOK${pts}`;
    type = "positive";
  } else if (ruleStr.startsWith("TAG_MATCH:")) {
    const match = ruleStr.match(/TAG_MATCH:\s*(\S+)\s*\+(\d+)/);
    if (match) {
      label = `🏷️ TAG MATCH (${match[1]}) +${match[2]}`;
    } else {
      label = `🏷️ ${ruleStr.replace("TAG_MATCH:", "TAG MATCH:")}`;
    }
    type = "positive";
  } else if (ruleStr.startsWith("RISK_PENALTY:")) {
    const match = ruleStr.match(/-\d+/);
    const penaltyVal = match ? match[0] : "-10";
    label = `⚠️ RISK PENALTY ${penaltyVal}`;
    type = "negative";
  } else if (ruleStr.startsWith("TOXIC_NOSHOW_PENALTY:")) {
    const match = ruleStr.match(/-\d+/);
    const penaltyVal = match ? match[0] : "-50";
    label = `🚫 TOXIC NO-SHOW PENALTY ${penaltyVal}`;
    type = "danger";
  } else if (ruleStr.startsWith("USER_RATING:")) {
    const match = ruleStr.match(/USER_RATING:\s*(\S+)\s*\+(\d+)/);
    if (match) {
      label = `🌟 USER RATING (${match[1].replace(/_/g, " ")}) +${match[2]}`;
    } else {
      label = `🌟 ${ruleStr.replace("USER_RATING:", "USER RATING:")}`;
    }
    type = "positive";
  } else if (ruleStr.startsWith("WISHLIST_BOOST:")) {
    const match = ruleStr.match(/\+(\d+)/);
    const pts = match ? ` +${match[1]}` : " +35";
    label = `❤️ WISHLIST BOOST${pts}`;
    type = "positive";
  } else if (ruleStr.startsWith("PROFILE_TOP_ATTENDED:")) {
    const match = ruleStr.match(/PROFILE_TOP_ATTENDED:\s*(\S+)\s*\+(\d+)/);
    if (match) {
      label = `🎯 TOP ATTENDED (${match[1].replace(/_/g, " ")}) +${match[2]}`;
    } else {
      label = `🎯 ${ruleStr.replace("PROFILE_TOP_ATTENDED:", "TOP ATTENDED:")}`;
    }
    type = "positive";
  } else if (ruleStr.startsWith("PROFILE_HIGH_RATING_ON_ATTENDED:")) {
    const match = ruleStr.match(
      /PROFILE_HIGH_RATING_ON_ATTENDED:\s*(\S+)\s*\+(\d+)/,
    );
    if (match) {
      label = `⭐ HIGH RATING (${match[1].replace(/_/g, " ")}) +${match[2]}`;
    } else {
      label = `⭐ ${ruleStr}`;
    }
    type = "positive";
  } else if (ruleStr.startsWith("PROFILE_TOP_BOOKED:")) {
    const match = ruleStr.match(/PROFILE_TOP_BOOKED:\s*(\S+)\s*\+(\d+)/);
    if (match) {
      label = `📅 TOP BOOKED (${match[1].replace(/_/g, " ")}) +${match[2]}`;
    } else {
      label = `📅 ${ruleStr}`;
    }
    type = "positive";
  } else if (ruleStr.startsWith("PROFILE_TOP_WISHLIST:")) {
    const match = ruleStr.match(/PROFILE_TOP_WISHLIST:\s*(\S+)\s*\+(\d+)/);
    if (match) {
      label = `⭐ TOP WISHLIST (${match[1].replace(/_/g, " ")}) +${match[2]}`;
    } else {
      label = `⭐ ${ruleStr}`;
    }
    type = "positive";
  } else if (ruleStr.startsWith("PROFILE_TOP_NOSHOW:")) {
    const match = ruleStr.match(/PROFILE_TOP_NOSHOW:\s*(\S+)\s*(-\d+)/);
    if (match) {
      label = `⚠️ TOP NO-SHOW (${match[1].replace(/_/g, " ")}) ${match[2]}`;
    } else {
      label = `⚠️ ${ruleStr}`;
    }
    type = "negative";
  } else if (ruleStr.includes("PROFILE_PLAN_ADHERENCE_WISHLIST")) {
    label = `🎯 PLAN ADHERENCE +10`;
    type = "positive";
  } else if (ruleStr.startsWith("SEQUENCE_BOOST:")) {
    label = `🔀 SEQUENCE BOOST +40`;
    type = "positive";
  } else if (ruleStr.startsWith("BLOCKED:")) {
    label = `🚫 BLOCKED (GRAND PUBLIC)`;
    type = "danger";
  } else if (ruleStr.startsWith("MUST_BOOK_SKIPPED:")) {
    label = `✓ MUST-BOOK (ALREADY BOOKED)`;
    type = "neutral";
  } else {
    if (ruleStr.includes("-")) type = "negative";
    label = ruleStr.replace(/_/g, " ");
  }

  return `<span class="rule-badge rule-badge-${type}">${label}</span>`;
}

function getUserSummaryCardHtml(profile, rulesSet = null) {
  if (!profile && (!rulesSet || rulesSet.size === 0)) return "";

  const strikes = profile
    ? Math.max(0, profile.risk_score - profile.noshow_titles.length * 2)
    : 0;

  const activeRulesPills = [];

  if (rulesSet && rulesSet.size > 0) {
    rulesSet.forEach((ruleStr) => {
      activeRulesPills.push(formatRuleBadge(ruleStr));
    });
  } else if (profile) {
    if (profile.role === "PRO" || profile.role === "DECISION_MAKER") {
      activeRulesPills.push(formatRuleBadge("MUST_BOOK_BOOST: +150"));
    }
    if (profile.risk_score > 0) {
      const penalty = profile.risk_score * 5;
      activeRulesPills.push(formatRuleBadge(`RISK_PENALTY: score -${penalty}`));
    }
    if (profile.wishlist_titles && profile.wishlist_titles.length > 0) {
      activeRulesPills.push(formatRuleBadge("WISHLIST_BOOST: +35"));
    }
    if (profile.plan_adherence >= 60) {
      activeRulesPills.push(
        formatRuleBadge("PROFILE_PLAN_ADHERENCE_WISHLIST +10"),
      );
    }
    if (profile.preferred_tags && profile.preferred_tags.length > 0) {
      profile.preferred_tags.forEach((t) => {
        activeRulesPills.push(formatRuleBadge(`TAG_MATCH: ${t} +25`));
      });
    }
  }

  const rulesSummarySection =
    activeRulesPills.length > 0
      ? `
      <div class="user-rules-summary">
        <div class="user-rules-label">Scoring Impact & Active Rules Summary:</div>
        <div class="user-rules-pills">${activeRulesPills.join("")}</div>
      </div>
    `
      : "";

  const headerSection = profile
    ? `
        <div class="user-summary-top">
            <div class="user-summary-profile">
                <span class="user-badge-role">${profile.role.replace(/_/g, " ")}</span>
                <span class="user-id-code">ID: <code>${profile.user_id}</code></span>
            </div>
            <div class="user-risk-badge ${profile.risk_score > 0 ? "is-risk" : "is-clean"}">
                <span class="risk-dot"></span>
                <span>Risk Score: <strong>${profile.risk_score}</strong></span>
            </div>
        </div>
        <div class="user-stats-grid">
            <div class="stat-pill stat-noshow">
                <span class="stat-icon">🚫</span>
                <span class="stat-info">
                    <span class="stat-num">${profile.noshow_titles.length}</span>
                    <span class="stat-label">No-Shows</span>
                </span>
            </div>
            <div class="stat-pill stat-strikes">
                <span class="stat-icon">⚠️</span>
                <span class="stat-info">
                    <span class="stat-num">${strikes}</span>
                    <span class="stat-label">Strikes</span>
                </span>
            </div>
            <div class="stat-pill stat-wishlist">
                <span class="stat-icon">⭐</span>
                <span class="stat-info">
                    <span class="stat-num">${profile.wishlist_titles.length}</span>
                    <span class="stat-label">Wishlist</span>
                </span>
            </div>
            <div class="stat-pill stat-adherence">
                <span class="stat-icon">🎯</span>
                <span class="stat-info">
                    <span class="stat-num">${profile.plan_adherence}%</span>
                    <span class="stat-label">Adherence</span>
                </span>
            </div>
        </div>
    `
    : `
        <div class="user-summary-top">
            <div class="user-summary-profile">
                <span class="user-badge-role">GUEST USER</span>
            </div>
        </div>
    `;

  return `
        <div class="user-summary-card">
            ${headerSection}
            ${rulesSummarySection}
        </div>
    `;
}

function confirmUserId() {
  const input = document.getElementById("user-id-input");
  const uid = input && input.value.trim();
  if (!uid) {
    currentUserId = "";
  } else {
    currentUserId = uid;
  }

  const profile = analyzeUserHistoryJS(currentUserId);
  document.getElementById("summary-content").innerHTML =
    getUserSummaryCardHtml(profile);

  // proceed to questions
  showStep("questions-step");
  renderQuestion();
}

function analyzeUserHistoryJS(userId) {
  if (!userId) return null;
  const uid = String(userId);
  const userRow = usersRows.find((r) => String(r.id) === uid) || null;
  if (!userRow) return null;

  // Visited titles (notifications where type not containing 'no_show')
  const visited = notifRows
    .filter(
      (r) =>
        String(r.user_id).trim() === uid &&
        !String(r.type).toLowerCase().includes("no_show"),
    )
    .map((r) => {
      try {
        const d = JSON.parse(r.data || "{}");
        return d.content_title || d.title || r.event_title || "";
      } catch (e) {
        return r.event_title || "";
      }
    })
    .filter(Boolean);

  // Booked titles
  const booked = bookingsMap[uid] || [];

  // Wishlist titles
  const wishlist = wishRows
    .filter((r) => String(r.user_id).trim() === uid)
    .map((r) => r.event_title || r.content_title || "")
    .filter(Boolean);

  const noshows = notifRows
    .filter(
      (r) =>
        String(r.user_id).trim() === uid &&
        String(r.type).toLowerCase().includes("no_show"),
    )
    .map((r) => {
      try {
        const d = JSON.parse(r.data || "{}");
        return d.content_title || d.title || r.event_title || "";
      } catch (e) {
        return r.event_title || "";
      }
    })
    .filter(Boolean);

  function getTagCountsForTitles(titles) {
    const counts = {};
    titles.forEach((title) => {
      festivalContent.forEach((item) => {
        if (String(item.title) === String(title)) {
          item.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1));
        }
      });
    });
    return counts;
  }

  const attendance_tag_counts = getTagCountsForTitles(visited);
  const booking_tag_counts = getTagCountsForTitles(booked);
  const wishlist_tag_counts = getTagCountsForTitles(wishlist);
  const noshow_tag_counts = getTagCountsForTitles(noshows);

  function topTags(counts, limit = 3) {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map((e) => e[0]);
  }

  const matched = Array.from(
    new Set(wishlist.filter((w) => visited.includes(w))),
  );
  const missed = Array.from(
    new Set(wishlist.filter((w) => !visited.includes(w))),
  );
  const spontaneous = Array.from(
    new Set(visited.filter((v) => !wishlist.includes(v))),
  );

  return {
    user_id: uid,
    role: userRow.role || "UNKNOWN",
    wishlist_count: wishlist.length,
    visited_count: visited.length,
    booked_count: booked.length,
    attended_bookings: booked.filter((b) => visited.includes(b)),
    matched_count: matched.length,
    missed_count: missed.length,
    spontaneous_count: spontaneous.length,
    plan_adherence: wishlist.length
      ? Math.round((matched.length / wishlist.length) * 1000) / 10
      : 0,
    top_attended_tags: topTags(attendance_tag_counts),
    top_booked_tags: topTags(booking_tag_counts),
    top_wishlist_tags: topTags(wishlist_tag_counts),
    top_noshow_tags: topTags(noshow_tag_counts),
    risk_score: noshows.length * 2 + (parseInt(userRow.strike_count || 0) || 0),
    visited_titles: visited,
    wishlist_titles: wishlist,
    noshow_titles: noshows,
  };
}

// Call this instead of showResults to respect disabled state and selection
function runShowResults() {
  const seeBtn = document.getElementById("see-btn");
  if (seeBtn && seeBtn.disabled) return;
  showResults();
}

// Enable see button when user made a rating or provided an id
function updateSeeButtonState() {
  const seeBtn = document.getElementById("see-btn");
  if (!seeBtn) return;
  const hasRating = Object.values(userRatings || {}).some((v) => v > 0);
  const hasId =
    document.getElementById("user-id-input") &&
    document.getElementById("user-id-input").value.trim().length > 0;
  seeBtn.disabled = !(hasRating || hasId);
}

// wire up input listener after DOM loads (ensure element exists)
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("user-id-input");
  if (input) input.addEventListener("input", updateSeeButtonState);
  // also update when ratings change via setRating/setInterest
  const observer = new MutationObserver(updateSeeButtonState);
  const summary = document.getElementById("summary-content");
  if (summary) observer.observe(summary, { childList: true, subtree: true });
  updateSeeButtonState();
});

function applyUserRules(userId, contentTags, contentTitle) {
  // returns { blocked: bool, boost: number, rulesApplied: string[] }
  const user = usersMap[userId];
  const applied = [];
  if (!user) return { blocked: false, boost: 0, rulesApplied: applied };
  const role = user.role;
  const preferred = user.preferred_tags || [];

  // Rule: GRAND_PUBLIC blocked from B2B_NETWORKING
  if (role === "GRAND_PUBLIC" && contentTags.includes("B2B_NETWORKING")) {
    applied.push("BLOCKED: B2B not allowed for GRAND_PUBLIC");
    return { blocked: true, boost: 0, rulesApplied: applied };
  }

  let boost = 0;
  
  // Rule B: Priority Boost - +150 for unbooked B2B/Talks for PRO and Decision Makers
  if (
    (role === "PRO" || role === "DECISION_MAKER") &&
    (contentTags.includes("B2B_NETWORKING") ||
      contentTags.includes("CREATOR_TALK"))
  ) {
    const history = bookingsMap[userId] || [];
    if (!history.includes(contentTitle)) {
      boost += 150;
      applied.push("MUST_BOOK_BOOST: not booked yet (PRO/DECISION_MAKER) +150");
    } else {
      applied.push("MUST_BOOK_SKIPPED: already booked");
    }
  }

  // Rule C: Chained Event Boost - +40 for VR preference leading to Creator Talk
  const history = bookingsMap[userId] || [];
  if (
    preferred.includes("VR_EXPERIENCE") &&
    contentTags.includes("CREATOR_TALK") &&
    history.length > 0
  ) {
    boost += 40;
    applied.push("SEQUENCE_BOOST: VR then CreatorTalk pattern +40");
  }

  // Rule D: Tag Alignment - +25 per matching tag with user preferences
  for (const t of contentTags) {
    if (preferred.includes(t)) {
      boost += 25;
      applied.push(`TAG_MATCH: ${t} +25`);
    }
  }

  return { blocked: false, boost, rulesApplied: applied };
}

function updateProgressRail() {
  const total = Object.keys(categories).length;
  const track = document.getElementById("progress-rail");
  if (track)
    track.style.setProperty(
      "--fill",
      (currentQuestionIndex / (total - 1)).toFixed(3),
    );
  document.querySelectorAll(".signal-node").forEach((node) => {
    const i = Number(node.dataset.i);
    node.classList.toggle("filled", i < currentQuestionIndex);
    node.classList.toggle("active", i === currentQuestionIndex);
  });
}

function renderQuestion(direction) {
  const categoryKeys = Object.keys(categories);
  const currentCategory = categoryKeys[currentQuestionIndex];
  const categoryData = categories[currentCategory];
  const isInterested = userRatings[currentCategory] > 0;
  const color = categoryColor[currentCategory];
  const amp = isInterested ? userRatings[currentCategory] / 5 : 0.12;
  const enterClass =
    direction === "next"
      ? "enter-next"
      : direction === "back"
        ? "enter-back"
        : "enter-first";

  const html = `
        <div class="q-scene ${enterClass}" data-cat="${currentCategory}" style="--cat-color:${color};--amp:${amp}">
            <div class="q-wave" aria-hidden="true">${buildEqBars(24)}</div>

            <div class="q-emblem">
                <span class="emblem-halo"></span>
                <span class="emblem-ping p1"></span>
                <span class="emblem-ping p2"></span>
                <span class="emblem-core">${categoryData.icon}</span>
            </div>

            <p class="q-eyebrow">Are you interested in</p>
            <h3 class="q-headline">${categoryData.description}?</h3>

            <div class="q-choices">
                <button type="button" class="choice-tile tile-yes ${isInterested ? "is-on" : "is-off-dim"}"
                        onclick="setInterest('${currentCategory}', true)" aria-pressed="${isInterested}">
                    <span class="tile-icon">${checkSvg()}</span>
                    <span class="tile-label">Yes, I'm in</span>
                </button>
                <button type="button" class="choice-tile tile-no ${!isInterested ? "is-on" : "is-off-dim"}"
                        onclick="setInterest('${currentCategory}', false)" aria-pressed="${!isInterested}">
                    <span class="tile-icon">${xSvg()}</span>
                    <span class="tile-label">Not this time</span>
                </button>
            </div>

            <div class="stars-slot">${isInterested ? buildStarsBlock(currentCategory) : ""}</div>
        </div>
    `;

  document.getElementById("questions-content").innerHTML = html;
  document.getElementById("current-question").textContent =
    currentQuestionIndex + 1;
  updateProgressRail();
  initTilt(document.querySelector(".q-scene"));

  document.getElementById("prev-btn").style.visibility = "visible";
  document.getElementById("next-btn-label").textContent =
    currentQuestionIndex === categoryKeys.length - 1 ? "See Summary" : "Next";
}

function buildStarsBlock(category) {
  const rating = userRatings[category];
  return `
        <div class="stars-wrap">
            <div class="stars-divider"></div>
            <div class="stars-head">
                <span class="stars-label">Rate your interest</span>
                <span class="rating-label" id="rating-label-${category}">${ratingLabels[rating] || ""}</span>
            </div>
            <div class="stars-row" id="rating-${category}">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (star) => `
                    <button type="button" class="star-btn ${rating >= star ? "lit" : ""}"
                            onclick="setRating('${category}', ${star}, event)"
                            onmouseenter="previewStar('${category}', ${star})"
                            onmouseleave="clearPreview('${category}')"
                            aria-label="${star} star${star > 1 ? "s" : ""}">
                        ${starSvg()}
                    </button>
                `,
                  )
                  .join("")}
            </div>
        </div>
    `;
}

function buildEqBars(count) {
  let html = "";
  for (let i = 0; i < count; i++) {
    const dur = (0.7 + Math.random() * 0.9).toFixed(2);
    const delay = (-(Math.random() * 1.6)).toFixed(2);
    const h = (30 + Math.random() * 70).toFixed(0);
    html += `<span class="eq-bar" style="--dur:${dur}s;--delay:${delay}s;--h:${h}%"></span>`;
  }
  return html;
}

function starSvg() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.8l7.1-.7z"/></svg>`;
}

function checkSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>`;
}

function xSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>`;
}

function initTilt(sceneEl) {
  if (prefersReducedMotion || !sceneEl) return;
  const emblem = sceneEl.querySelector(".q-emblem");
  if (!emblem) return;
  const maxTilt = 12;
  sceneEl.addEventListener("mousemove", (e) => {
    const rect = sceneEl.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    emblem.style.transform = `perspective(600px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateZ(4px)`;
  });
  sceneEl.addEventListener("mouseleave", () => {
    emblem.style.transform = "";
  });
}

function setInterest(category, interested) {
  if (interested) {
    if (userRatings[category] === 0) userRatings[category] = 3;
  } else {
    userRatings[category] = 0;
  }
  updateChoiceUI(category);
}

function updateChoiceUI(category) {
  const item = document.querySelector(`.q-scene[data-cat="${category}"]`);
  if (!item) return;
  const interested = userRatings[category] > 0;

  const tileYes = item.querySelector(".tile-yes");
  const tileNo = item.querySelector(".tile-no");
  tileYes.classList.toggle("is-on", interested);
  tileYes.classList.toggle("is-off-dim", !interested);
  tileYes.setAttribute("aria-pressed", String(interested));
  tileNo.classList.toggle("is-on", !interested);
  tileNo.classList.toggle("is-off-dim", interested);
  tileNo.setAttribute("aria-pressed", String(!interested));

  item.querySelector(".stars-slot").innerHTML = interested
    ? buildStarsBlock(category)
    : "";
  item.style.setProperty(
    "--amp",
    interested ? userRatings[category] / 5 : 0.12,
  );
}

function setRating(category, rating, evt) {
  userRatings[category] = rating;

  const stars = document.querySelectorAll(`#rating-${category} .star-btn`);
  stars.forEach((star, index) => {
    star.classList.toggle("lit", index < rating);
    star.classList.remove("just-lit");
  });
  updateRatingLabel(category, rating);

  const item = document.querySelector(`.q-scene[data-cat="${category}"]`);
  if (item) item.style.setProperty("--amp", rating / 5);

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add("just-lit");
    spawnSparkles(evt.currentTarget);
  }
}

function previewStar(category, n) {
  const row = document.querySelector(`#rating-${category}`);
  if (!row) return;
  row
    .querySelectorAll(".star-btn")
    .forEach((b, i) => b.classList.toggle("preview", i < n));
  updateRatingLabel(category, n);
}

function clearPreview(category) {
  const row = document.querySelector(`#rating-${category}`);
  if (!row) return;
  row
    .querySelectorAll(".star-btn")
    .forEach((b) => b.classList.remove("preview"));
  updateRatingLabel(category, userRatings[category]);
}

function updateRatingLabel(category, n) {
  const label = document.getElementById(`rating-label-${category}`);
  if (!label) return;
  label.textContent = ratingLabels[n] || "";
  label.classList.remove("pop");
  void label.offsetWidth;
  label.classList.add("pop");
}

function spawnSparkles(el) {
  if (prefersReducedMotion) return;
  const rect = el.getBoundingClientRect();
  const cardRect = document.getElementById("app-card").getBoundingClientRect();
  const originX = rect.left + rect.width / 2 - cardRect.left;
  const originY = rect.top + rect.height / 2 - cardRect.top;

  for (let i = 0; i < 8; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
    const dist = 26 + Math.random() * 18;
    s.style.setProperty("--sx", Math.cos(angle) * dist + "px");
    s.style.setProperty("--sy", Math.sin(angle) * dist + "px");
    s.style.left = originX + "px";
    s.style.top = originY + "px";
    document.getElementById("app-card").appendChild(s);
    setTimeout(() => s.remove(), 650);
  }
}

function nextQuestion() {
  const categoryKeys = Object.keys(categories);
  if (currentQuestionIndex < categoryKeys.length - 1) {
    currentQuestionIndex++;
    renderQuestion("next");
  } else {
    showSummary();
  }
}

function previousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderQuestion("back");
  } else {
    showStep("welcome-step");
  }
}

function showSummary() {
  showStep("summary-step");
  const categoryKeys = Object.keys(categories);
  selectedCategories = categoryKeys.filter((cat) => userRatings[cat] > 0);

  let summaryHtml = "";

  if (selectedCategories.length === 0) {
    summaryHtml =
      '<div class="no-results">No categories selected. All experiences will be shown equally.</div>';
  } else {
    selectedCategories.forEach((cat, i) => {
      const stars =
        "★".repeat(userRatings[cat]) + "☆".repeat(5 - userRatings[cat]);
      summaryHtml += `
                <div class="summary-item" style="--cat-color:${categoryColor[cat]};animation-delay:${i * 0.07}s">
                    <div class="sum-icon">${categories[cat].icon}</div>
                    <div>
                        <div class="sum-name">${cat.replace(/_/g, " ")}</div>
                        <div class="sum-desc">${categories[cat].description}</div>
                        <div class="sum-stars">${stars}</div>
                    </div>
                </div>
            `;
    });
  }

  const profile = analyzeUserHistoryJS(currentUserId);
  document.getElementById("summary-content").innerHTML =
    getUserSummaryCardHtml(profile) + summaryHtml;
}

function dominantColor(item) {
  if (item.score > 0) {
    for (const tag of item.tags) {
      if (categoryColor[tag] && userRatings[tag] > 0) return categoryColor[tag];
    }
  }
  return "var(--text-tertiary)";
}

function showResults() {
  showStep("results-step");

  const userId =
    (document.getElementById("user-id-input") &&
      document.getElementById("user-id-input").value.trim()) ||
    "";
  const hasUser = userId && usersMap[userId];
  const profile = analyzeUserHistoryJS(userId);
  const userRulesSet = new Set();

  festivalContent.forEach((content) => {
    let score = 0;
    const appliedRules = [];

    // Phase 2: onboarding star ratings
    content.tags.forEach((tag) => {
      if (userRatings[tag] && userRatings[tag] > 0) {
        const add = userRatings[tag] * 15;
        score += add;
        appliedRules.push(`USER_RATING: ${tag} +${add}`);
      }
    });

    // Apply user-specific rules if a valid user id was provided
    if (hasUser) {
      const res = applyUserRules(userId, content.tags, content.title);
      if (res.blocked) {
        content.score = 0;
        content.appliedRules = res.rulesApplied;
        res.rulesApplied.forEach((r) => userRulesSet.add(r));
        return; // continue to next item
      } else {
        score += res.boost;
        res.rulesApplied.forEach((r) => {
          appliedRules.push(r);
          userRulesSet.add(r);
        });
      }
    }

    // Apply V1/V2/V3-derived profile scoring (category_profile_score like)
    if (profile) {
      const topAttended = profile.top_attended_tags || [];
      const topBooked = profile.top_booked_tags || [];
      const topWishlist = profile.top_wishlist_tags || [];
      const topNoshow = profile.top_noshow_tags || [];
      const wishlistTitles = profile.wishlist_titles || [];
      const noshowTitles = profile.noshow_titles || [];

      // Wishlist title boost (V3)
      if (wishlistTitles.includes(content.title)) {
        score += 35;
        appliedRules.push(`WISHLIST_BOOST: ${content.title} +35`);
      }

      // Risk Score & Toxic No-show penalty (V1 & V3)
      if (profile.risk_score > 0) {
        const penalty = profile.risk_score * 5;
        score -= penalty;
        appliedRules.push(`RISK_PENALTY: score -${penalty}`);
      }
      if (
        wishlistTitles.includes(content.title) &&
        noshowTitles.includes(content.title)
      ) {
        score -= 50;
        appliedRules.push(`TOXIC_NOSHOW_PENALTY: ${content.title} -50`);
      }

      // per-tag scoring
      content.tags.forEach((tag) => {
        if (topAttended.includes(tag)) {
          score += 20;
          appliedRules.push(`PROFILE_TOP_ATTENDED: ${tag} +20`);
          // if user gave high live rating for this tag, extra boost
          if ((userRatings[tag] || 0) >= 4) {
            score += 15;
            appliedRules.push(`PROFILE_HIGH_RATING_ON_ATTENDED: ${tag} +15`);
          }
        }
        if (topBooked.includes(tag)) {
          score += 10;
          appliedRules.push(`PROFILE_TOP_BOOKED: ${tag} +10`);
        }
        if (topWishlist.includes(tag)) {
          score += 8;
          appliedRules.push(`PROFILE_TOP_WISHLIST: ${tag} +8`);
        }
        if (topNoshow.includes(tag)) {
          score -= 15;
          appliedRules.push(`PROFILE_TOP_NOSHOW: ${tag} -15`);
        }
      });

      // plan adherence bonus
      if ((profile.plan_adherence || 0) >= 60) {
        const wishlistMatch = content.tags.some((t) =>
          (topWishlist || []).includes(t),
        );
        if (wishlistMatch) {
          score += 10;
          appliedRules.push("PROFILE_PLAN_ADHERENCE_WISHLIST +10");
        }
      }
    }

    content.score = score;
    content.appliedRules = appliedRules;
    appliedRules.forEach((r) => userRulesSet.add(r));
  });

  const userSummaryHtml = getUserSummaryCardHtml(profile, userRulesSet);

  const sortedContent = [...festivalContent].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(sortedContent[0].score, 1);

  let rowsHtml = "";
  sortedContent.forEach((item, i) => {
    const pct = item.score > 0 ? Math.round((item.score / maxScore) * 100) : 0;
    const circumference = 175.93;
    const offset = circumference - (pct / 100) * circumference;
    const isTop = i === 0 && item.score > 0;
    const itemColor = dominantColor(item);

    const tagsHtml = item.tags
      .map((tag) => {
        const color = categoryColor[tag];
        return color
          ? `<span class="tag" style="--tag-color:${color}">${tag.replace(/_/g, " ")}</span>`
          : `<span class="tag tag-neutral">${tag.replace(/_/g, " ")}</span>`;
      })
      .join("");

    const rules = item.appliedRules || [];
    const rulesHtml = rules.length
      ? `<div class="row-rules">${rules.map(formatRuleBadge).join("")}</div>`
      : "";

    rowsHtml += `
            <div class="result-row ${isTop ? "is-top" : ""}" style="--item-color:${itemColor};animation-delay:${i * 0.06}s">
                <div class="row-emblem-slot">
                    <div class="row-emblem">
                        <svg class="score-ring" viewBox="0 0 60 60">
                            <circle class="ring-track" cx="30" cy="30" r="28"/>
                            <circle class="ring-fill" cx="30" cy="30" r="28" data-offset="${offset}" style="stroke-dashoffset:${circumference}"/>
                        </svg>
                        <span class="score-num" data-target="${item.score}">0</span>
                    </div>
                </div>
                <div class="row-body">
                    <div class="row-eyebrow">${isTop ? "Top pick" : `Match #${i + 1}`}</div>
                    <div class="row-title">${item.title}</div>
                    <div class="row-tags">${tagsHtml}</div>
                    ${rulesHtml}
                </div>
            </div>
        `;
  });

  document.getElementById("results-content").innerHTML = `
        ${userSummaryHtml}
        <div class="results-feed">
            <div class="feed-line"></div>
            ${rowsHtml}
        </div>
    `;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll(".ring-fill").forEach((ring) => {
        ring.style.transitionDelay = "0.3s";
        ring.style.strokeDashoffset = ring.dataset.offset;
      });
      document
        .querySelectorAll(".score-num")
        .forEach((num) => animateCountUp(num, Number(num.dataset.target)));
    });
  });

  launchConfetti();
}

function animateCountUp(el, target) {
  if (prefersReducedMotion || target === 0) {
    el.textContent = target;
    return;
  }
  const duration = 900;
  const start = performance.now() + 300;
  function tick(now) {
    const elapsed = now - start;
    if (elapsed < 0) {
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(eased * target);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function restart() {
  currentQuestionIndex = 0;
  userRatings = {};
  selectedCategories = [];
  Object.keys(categories).forEach((cat) => {
    userRatings[cat] = 0;
  });
  showStep("welcome-step");
}

function showStep(stepId) {
  document
    .querySelectorAll(".step")
    .forEach((step) => step.classList.remove("active"));
  document.getElementById(stepId).classList.add("active");
}

// ============================================
// Confetti burst
// ============================================
function launchConfetti() {
  if (prefersReducedMotion) return;
  const canvas = document.getElementById("confetti-canvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.scale(dpr, dpr);

  const colors = ["#FF4D94", "#FFB454", "#45E8D2"];
  const cx = window.innerWidth / 2;
  const originY = window.innerHeight * 0.28;

  const particles = Array.from({ length: 90 }, () => ({
    x: cx + (Math.random() - 0.5) * 140,
    y: originY,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 9 - 3,
    size: 4 + Math.random() * 5,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 1,
  }));

  const startTime = performance.now();

  function frame(now) {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let alive = false;
    particles.forEach((p) => {
      p.vy += 0.28;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life = Math.max(0, 1 - elapsed / 1700);
      if (p.life > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    });

    if (alive) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  requestAnimationFrame(frame);
}
