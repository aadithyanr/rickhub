# rickhub

a chrome extension that replaces your github homepage with something actually useful.

instead of showing trending repos and random suggestions, rickhub shows:

- 🔥 your current commit streak (includes private repos)
- 💻 commits you've made this week
- ⭐ stars you've gained this week
- 📈 total repo count
- 📝 inline todos for each repo (stored locally)

## why i built this

i didn’t see the point of the current github homepage.  
it wasn’t about *me* — so i made one that is.

## features

- uses your personal access token (pat) to access private + public activity
- token is stored locally, never shared
- shows personal stats: streak, commits, stars, repos
- lets you manage todos for each repo directly
- all data is local, lightweight, and simple

## setup

1. clone or download this repo  
2. go to `chrome://extensions` in chrome  
3. enable "developer mode" (top right)  
4. click "load unpacked" and select this folder  
5. go to `github.com` — rickhub activates on the homepage  
6. when prompted, paste your github personal access token  
   (classic token with `repo` and `user` scopes)

## notes

- todos are saved per repo using chrome’s local storage  
- click the 📝 button next to any repo to manage todos  
- rickhub auto-refreshes stats every 5 minutes  
- your token stays private — nothing is sent anywhere

---

made for devs who just want their homepage to make sense.  
no bs, just your work — rickhub.
