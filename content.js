// Function to get the username from the page
function getUsername() {
  const metaTag = document.querySelector('meta[name="user-login"]');
  return metaTag ? metaTag.content : null;
}

// Function to get stored PAT
async function getStoredPAT() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['github_pat'], (result) => {
      resolve(result.github_pat || null);
    });
  });
}

// Function to store PAT
async function storePAT(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ github_pat: token }, () => {
      resolve();
    });
  });
}

// Function to show PAT input modal
function showPATModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'pat-modal-overlay';
    modal.innerHTML = `
      <div class="pat-modal">
        <h2>🔑 GitHub Personal Access Token Required</h2>
        <p>To show your real coding stats (including private repos), we need your GitHub PAT:</p>
        <ol>
          <li>Go to <a href="https://github.com/settings/tokens" target="_blank">GitHub Settings → Tokens</a></li>
          <li>Click "Generate new token" → "Generate new token (classic)"</li>
          <li>Select scopes: <code>repo</code> and <code>user</code></li>
          <li>Copy the token and paste it below</li>
        </ol>
        <input type="password" class="pat-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
        <div class="pat-buttons">
          <button class="pat-cancel">Cancel</button>
          <button class="pat-save">Save Token</button>
        </div>
        <p class="pat-note">🔒 Token is stored locally and never shared</p>
      </div>
    `;

    document.body.appendChild(modal);

    const input = modal.querySelector('.pat-input');
    const saveBtn = modal.querySelector('.pat-save');
    const cancelBtn = modal.querySelector('.pat-cancel');

    saveBtn.addEventListener('click', async () => {
      const token = input.value.trim();
      if (token) {
        await storePAT(token);
        document.body.removeChild(modal);
        resolve(token);
      }
    });

    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      resolve(null);
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveBtn.click();
      }
    });

    input.focus();
  });
}

// Function to make authenticated API requests
async function fetchWithAuth(url) {
  const token = await getStoredPAT();
  
  if (!token) {
    const newToken = await showPATModal();
    if (!newToken) throw new Error('GitHub token required');
  }

  const finalToken = await getStoredPAT();
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${finalToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Invalid token, ask for new one
      await storePAT(null);
      throw new Error('Invalid token, please try again');
    }
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

// Function to calculate coding streak from events (including private)
function calculateStreak(events) {
  if (!events || events.length === 0) return 0;
  
  const today = new Date();
  const commitEvents = events.filter(event => 
    event.type === 'PushEvent' && event.payload && event.payload.commits
  );
  
  if (commitEvents.length === 0) return 0;
  
  // Get unique days with commits
  const commitDays = [...new Set(commitEvents.map(event => {
    const date = new Date(event.created_at);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }))].sort().reverse();
  
  let streak = 0;
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = new Date(today.getTime() - 24*60*60*1000).toISOString().split('T')[0];
  
  // Start checking from today or yesterday
  let checkDate = commitDays.includes(todayStr) ? todayStr : 
                  commitDays.includes(yesterdayStr) ? yesterdayStr : null;
  
  if (!checkDate) return 0;
  
  let currentDate = new Date(checkDate);
  
  for (const commitDay of commitDays) {
    const commitDate = new Date(commitDay);
    const diffTime = currentDate.getTime() - commitDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (diffDays === 1) {
      streak++;
      currentDate = new Date(commitDate);
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

// Function to get commits this week from events
function getWeeklyCommits(events) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  return events
    .filter(event => {
      if (event.type !== 'PushEvent' || !event.payload || !event.payload.commits) return false;
      const eventDate = new Date(event.created_at);
      return eventDate >= oneWeekAgo;
    })
    .reduce((total, event) => total + (event.payload.commits ? event.payload.commits.length : 0), 0);
}

// Function to get stars gained this week
function getWeeklyStars(events) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  return events
    .filter(event => {
      if (event.type !== 'WatchEvent') return false;
      const eventDate = new Date(event.created_at);
      return eventDate >= oneWeekAgo;
    })
    .length;
}

// Function to fetch user events (with authentication for private repos)
async function fetchUserEvents(username) {
  try {
    return await fetchWithAuth(`https://api.github.com/users/${username}/events?per_page=300`);
  } catch (error) {
    console.error('Error fetching user events:', error);
    return [];
  }
}

// Todo functions
async function getTodos(repoName) {
  return new Promise((resolve) => {
    chrome.storage.local.get([`todos_${repoName}`], (result) => {
      resolve(result[`todos_${repoName}`] || []);
    });
  });
}

async function saveTodos(repoName, todos) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [`todos_${repoName}`]: todos }, () => {
      resolve();
    });
  });
}

// Function to show todo modal
async function showTodoModal(repo) {
  const todos = await getTodos(repo.name);
  
  const modal = document.createElement('div');
  modal.className = 'todo-modal-overlay';
  modal.innerHTML = `
    <div class="todo-modal">
      <h2>📝 ${repo.name} - Todos</h2>
      <div class="todo-list">
        ${todos.map((todo, index) => `
          <div class="todo-item ${todo.completed ? 'completed' : ''}">
            <input type="checkbox" ${todo.completed ? 'checked' : ''} data-index="${index}">
            <span class="todo-text">${todo.text}</span>
            <button class="delete-todo" data-index="${index}">×</button>
          </div>
        `).join('')}
      </div>
      <div class="add-todo">
        <input type="text" class="new-todo-input" placeholder="Add a new todo..." />
        <button class="add-todo-btn">Add</button>
      </div>
      <div class="todo-actions">
        <button class="todo-close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event handlers
  const todoList = modal.querySelector('.todo-list');
  const newTodoInput = modal.querySelector('.new-todo-input');
  const addBtn = modal.querySelector('.add-todo-btn');
  const closeBtn = modal.querySelector('.todo-close');

  // Add new todo
  const addTodo = async () => {
    const text = newTodoInput.value.trim();
    if (text) {
      todos.push({ text, completed: false, created: Date.now() });
      await saveTodos(repo.name, todos);
      newTodoInput.value = '';
      updateTodoList();
    }
  };

  // Update todo list display
  const updateTodoList = () => {
    todoList.innerHTML = todos.map((todo, index) => `
      <div class="todo-item ${todo.completed ? 'completed' : ''}">
        <input type="checkbox" ${todo.completed ? 'checked' : ''} data-index="${index}">
        <span class="todo-text">${todo.text}</span>
        <button class="delete-todo" data-index="${index}">×</button>
      </div>
    `).join('');
  };

  // Event delegation for dynamic elements
  todoList.addEventListener('change', async (e) => {
    if (e.target.type === 'checkbox') {
      const index = parseInt(e.target.dataset.index);
      todos[index].completed = e.target.checked;
      await saveTodos(repo.name, todos);
      updateTodoList();
    }
  });

  todoList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-todo')) {
      const index = parseInt(e.target.dataset.index);
      todos.splice(index, 1);
      await saveTodos(repo.name, todos);
      updateTodoList();
    }
  });

  addBtn.addEventListener('click', addTodo);
  newTodoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
  });

  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Focus input
  newTodoInput.focus();
}

// Function to toggle completed todos visibility
async function toggleCompletedTodos(repoElement, repo) {
  const todos = await getTodos(repo.name);
  const completedTodos = todos.filter(t => t.completed);
  const showCompletedBtn = repoElement.querySelector('.show-completed-btn');
  const inlineTodos = repoElement.querySelector('.inline-todos');
  
  let completedSection = repoElement.querySelector('.completed-todos-section');
  
  if (completedSection) {
    // Hide completed todos
    completedSection.remove();
    showCompletedBtn.textContent = completedTodos.length === 1 ? 'Show 1 completed' : `Show ${completedTodos.length} completed`;
  } else {
    // Show completed todos
    completedSection = document.createElement('div');
    completedSection.className = 'completed-todos-section';
    completedSection.innerHTML = `
      <ul class="completed-todo-list">
        ${completedTodos.map((todo, index) => `
          <li class="todo-preview-item completed">
            <input type="checkbox" class="quick-todo-check" 
                   data-repo="${repo.name}" data-todo-index="${todos.indexOf(todo)}"
                   checked>
            <span class="todo-preview-text completed">${todo.text}</span>
          </li>
        `).join('')}
      </ul>
    `;
    
    // Add event listeners to completed todos checkboxes
    const completedCheckboxes = completedSection.querySelectorAll('.quick-todo-check');
    completedCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        e.stopPropagation();
        const repoName = e.target.dataset.repo;
        const todoIndex = parseInt(e.target.dataset.todoIndex);
        const todos = await getTodos(repoName);
        
        todos[todoIndex].completed = e.target.checked;
        await saveTodos(repoName, todos);
        
        // Refresh the repo element
        const newRepoElement = await createRepoElement(repo);
        repoElement.replaceWith(newRepoElement);
      });
    });
    
    inlineTodos.appendChild(completedSection);
    showCompletedBtn.textContent = 'Hide completed';
  }
}

// Add quick add todo functionality
function addQuickTodoInput(repoElement, repo) {
  const noTodos = repoElement.querySelector('.no-todos');
  if (!noTodos) return;
  
  const quickAddHTML = `
    <div class="quick-add-todo">
      <input type="text" class="quick-todo-input" placeholder="Add a quick todo..." />
      <button class="quick-add-btn">Add</button>
      <button class="cancel-quick-add">×</button>
    </div>
  `;
  
  noTodos.innerHTML = quickAddHTML;
  
  const input = repoElement.querySelector('.quick-todo-input');
  const addBtn = repoElement.querySelector('.quick-add-btn');
  const cancelBtn = repoElement.querySelector('.cancel-quick-add');
  
  const addTodo = async () => {
    const text = input.value.trim();
    if (text) {
      const todos = await getTodos(repo.name);
      todos.push({ text, completed: false, created: Date.now() });
      await saveTodos(repo.name, todos);
      
      // Refresh the repo element
      const newRepoElement = await createRepoElement(repo);
      repoElement.replaceWith(newRepoElement);
    }
  };
  
  const cancelAdd = async () => {
    const newRepoElement = await createRepoElement(repo);
    repoElement.replaceWith(newRepoElement);
  };
  
  addBtn.addEventListener('click', addTodo);
  cancelBtn.addEventListener('click', cancelAdd);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
    if (e.key === 'Escape') cancelAdd();
  });
  
  input.focus();
}

// Function to create repository element with inline todo display
async function createRepoElement(repo) {
  const todos = await getTodos(repo.name);
  const todoCount = todos.length;
  const completedCount = todos.filter(t => t.completed).length;
  const incompleteTodos = todos.filter(t => !t.completed);
  const recentTodos = incompleteTodos.slice(0, 3); // Show only first 3 incomplete todos
  
  const repoDiv = document.createElement("div");
  repoDiv.className = "repository-card";
  repoDiv.innerHTML = `
        <h3>
            <a href="${repo.html_url}" class="repo-name">${repo.name}</a>
            ${repo.private ? '<span class="private-badge">Private</span>' : ""}
            <button class="todo-btn" data-repo-name="${repo.name}" title="Manage todos">
              📝 ${todoCount > 0 ? `${completedCount}/${todoCount}` : 'Add Todo'}
            </button>
        </h3>
        <p class="repo-description">${repo.description || ""}</p>
        
        ${todos.length > 0 ? `
        <div class="inline-todos">
          <div class="todos-header">
            <span class="todos-title">📋 Todos</span>
            <span class="todos-progress">${completedCount}/${todoCount} completed</span>
          </div>
          
          ${recentTodos.length > 0 ? `
          <ul class="todo-preview-list">
            ${recentTodos.map((todo, index) => `
              <li class="todo-preview-item">
                <input type="checkbox" class="quick-todo-check" 
                       data-repo="${repo.name}" data-todo-index="${todos.indexOf(todo)}"
                       ${todo.completed ? 'checked' : ''}>
                <span class="todo-preview-text ${todo.completed ? 'completed' : ''}">${todo.text}</span>
              </li>
            `).join('')}
          </ul>
          ` : ''}
          
          ${incompleteTodos.length > 3 ? `
            <div class="more-todos">
              <span class="more-todos-text">+${incompleteTodos.length - 3} more todos</span>
            </div>
          ` : ''}
          
          ${completedCount > 0 ? `
            <button class="show-completed-btn" data-repo="${repo.name}">
              ${completedCount === 1 ? 'Show 1 completed' : `Show ${completedCount} completed`}
            </button>
          ` : ''}
        </div>
        ` : `
        <div class="no-todos">
          <span class="no-todos-text">💡 Click the 📝 button to add your first todo!</span>
        </div>
        `}
        
        <div class="repo-stats">
            <span class="language">
                ${
                  repo.language
                    ? `<span class="repo-language-color" style="background-color: ${getLanguageColor(
                        repo.language
                      )}"></span> ${repo.language}`
                    : ""
                }
            </span>
            <span class="stars">⭐ ${repo.stargazers_count}</span>
            <span class="forks">🍴 ${repo.forks_count}</span>
            <span class="updated">Updated ${new Date(repo.updated_at).toLocaleDateString()}</span>
        </div>
    `;

  // Add todo button click handler
  const todoBtn = repoDiv.querySelector('.todo-btn');
  todoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTodoModal(repo);
  });

  // Add quick checkbox handlers
  const quickCheckboxes = repoDiv.querySelectorAll('.quick-todo-check');
  quickCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      const repoName = e.target.dataset.repo;
      const todoIndex = parseInt(e.target.dataset.todoIndex);
      const todos = await getTodos(repoName);
      
      todos[todoIndex].completed = e.target.checked;
      await saveTodos(repoName, todos);
      
      // Refresh the repo element to update the display
      const newRepoElement = await createRepoElement(repo);
      repoDiv.replaceWith(newRepoElement);
    });
  });

  // Add show completed button handler
  const showCompletedBtn = repoDiv.querySelector('.show-completed-btn');
  if (showCompletedBtn) {
    showCompletedBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCompletedTodos(repoDiv, repo);
    });
  }

  // Add no-todos click handler
  const noTodosText = repoDiv.querySelector('.no-todos-text');
  if (noTodosText) {
    noTodosText.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addQuickTodoInput(repoDiv, repo);
    });
  }

  return repoDiv;
}

// Function to create the stats bar
function createStatsBar(stats) {
  const statsBar = document.createElement('div');
  statsBar.className = 'github-stats-bar';
  statsBar.innerHTML = `
    <div class="stats-content">
      <div class="stat-item ${stats.streak > 0 ? 'streak-active' : ''}">
        <span class="stat-emoji">🔥</span>
        <span class="stat-text">${stats.streak} day streak</span>
      </div>
      <div class="stat-item">
        <span class="stat-emoji">💻</span>
        <span class="stat-text">${stats.weeklyCommits} commits this week</span>
      </div>
      <div class="stat-item">
        <span class="stat-emoji">⭐</span>
        <span class="stat-text">${stats.weeklyStars} stars gained</span>
      </div>
      <div class="stat-item">
        <span class="stat-emoji">📈</span>
        <span class="stat-text">${stats.totalRepos} repositories</span>
      </div>
    </div>
    <div class="stats-refresh">
      <button class="refresh-btn" title="Refresh stats">
        <span class="refresh-icon">↻</span>
      </button>
    </div>
  `;
  
  // Add click handler for refresh
  const refreshBtn = statsBar.querySelector('.refresh-btn');
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    setTimeout(async () => {
      await updateStats();
      refreshBtn.classList.remove('spinning');
    }, 500);
  });
  
  return statsBar;
}

// Function to update stats
async function updateStats() {
  const username = getUsername();
  if (!username) return;
  
  const events = await fetchUserEvents(username);
  const repos = await fetchRepositories(username);
  
  const stats = {
    streak: calculateStreak(events),
    weeklyCommits: getWeeklyCommits(events),
    weeklyStars: getWeeklyStars(events),
    totalRepos: repos.length
  };
  
  // Update existing stats bar if it exists
  const existingStatsBar = document.querySelector('.github-stats-bar');
  if (existingStatsBar) {
    existingStatsBar.querySelector('.stat-item:nth-child(1) .stat-text').textContent = `${stats.streak} day streak`;
    existingStatsBar.querySelector('.stat-item:nth-child(2) .stat-text').textContent = `${stats.weeklyCommits} commits this week`;
    existingStatsBar.querySelector('.stat-item:nth-child(3) .stat-text').textContent = `${stats.weeklyStars} stars gained`;
    existingStatsBar.querySelector('.stat-item:nth-child(4) .stat-text').textContent = `${stats.totalRepos} repositories`;
    
    // Update streak styling
    const streakItem = existingStatsBar.querySelector('.stat-item:first-child');
    if (stats.streak > 0) {
      streakItem.classList.add('streak-active');
    } else {
      streakItem.classList.remove('streak-active');
    }
  }
  
  return stats;
}

// Function to get language color
function getLanguageColor(language) {
  const colors = {
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Java: "#b07219",
    TypeScript: "#2b7489",
    Ruby: "#701516",
    Go: "#00ADD8",
    Rust: "#dea584",
    C: "#555555",
    "C++": "#f34b7d",
    HTML: "#e34c26",
    CSS: "#1572B6",
    PHP: "#777bb4",
    Swift: "#fa7343",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB"
  };
  return colors[language] || "#858585";
}

// Function to fetch repositories (with authentication)
async function fetchRepositories(username) {
  try {
    return await fetchWithAuth(`https://api.github.com/user/repos?sort=updated&per_page=100&type=all`);
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return [];
  }
}

// Main function to modify the homepage
async function modifyHomepage() {
  const username = getUsername();
  if (!username) return;

  // Get the main content area
  const mainContent = document.querySelector("main");
  if (!mainContent) return;

  // Clear existing content
  mainContent.innerHTML = "";

  // Create and add stats bar
  const loadingStats = {
    streak: "...",
    weeklyCommits: "...",
    weeklyStars: "...",
    totalRepos: "..."
  };
  const statsBar = createStatsBar(loadingStats);
  mainContent.appendChild(statsBar);

  // Create repositories container
  const reposContainer = document.createElement("div");
  reposContainer.className = "repositories-container";
  mainContent.appendChild(reposContainer);

  // Add loading state for repos
  reposContainer.innerHTML = '<div class="loading">Loading repositories...</div>';

  try {
    // Fetch data in parallel
    const [events, repos] = await Promise.all([
      fetchUserEvents(username),
      fetchRepositories(username)
    ]);

    // Calculate and update stats
    const stats = {
      streak: calculateStreak(events),
      weeklyCommits: getWeeklyCommits(events),
      weeklyStars: getWeeklyStars(events),
      totalRepos: repos.length
    };

    // Update stats bar
    statsBar.querySelector('.stat-item:nth-child(1) .stat-text').textContent = `${stats.streak} day streak`;
    statsBar.querySelector('.stat-item:nth-child(2) .stat-text').textContent = `${stats.weeklyCommits} commits this week`;
    statsBar.querySelector('.stat-item:nth-child(3) .stat-text').textContent = `${stats.weeklyStars} stars gained`;
    statsBar.querySelector('.stat-item:nth-child(4) .stat-text').textContent = `${stats.totalRepos} repositories`;

    // Update streak styling
    const streakItem = statsBar.querySelector('.stat-item:first-child');
    if (stats.streak > 0) {
      streakItem.classList.add('streak-active');
    }

    // Display repositories with todos
    reposContainer.innerHTML = "";
    if (repos.length === 0) {
      reposContainer.innerHTML = '<div class="no-repos">No repositories found</div>';
      return;
    }

    // Create repo elements with todo functionality
    for (const repo of repos) {
      const repoElement = await createRepoElement(repo);
      reposContainer.appendChild(repoElement);
    }

  } catch (error) {
    console.error('Error loading data:', error);
    if (error.message.includes('token')) {
      reposContainer.innerHTML = '<div class="error">GitHub token required. Please refresh to set up authentication.</div>';
    } else {
      reposContainer.innerHTML = '<div class="error">Error loading repositories</div>';
    }
  }
}

// Auto-refresh stats every 5 minutes
setInterval(updateStats, 5 * 60 * 1000);

// Run the modification when the page loads
if (window.location.pathname === "/") {
  modifyHomepage();
}