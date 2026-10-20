# Fukurō 梟

A calm desktop hub for your week. Your timetable, calendar, to-dos, notes, budget, habits and focus timer live in one window, and your data stays on your own PC.

![Overview](docs/overview.png)

## Download

Get **`Fukuro-Setup-x.y.z.exe`** from the [latest release](https://github.com/k4zmx/Fukuro/releases/latest) and run it. Windows only for now.

The installer isn't code-signed, so Windows SmartScreen may warn you the first time. Click **More info → Run anyway**.

Once installed, Fukurō checks this repo for new versions and offers **Restart to update**.

## What's inside

| | |
|---|---|
| **Overview** | Your day at a glance: a sky that follows the real sun, weather, what's on now, free time left, focus, habits, money |
| **Calendar** | Week and month views. Drag to move or resize, one-off or weekly events, filters, free-time finder, print / .ics export |
| **Timetable** | Your weekly classes and work shifts, entered once. Groups, room, teacher. Share it with classmates as a file |
| **Exams & deadlines** | Countdown and a revision planner that books sessions into your free time |
| **To-dos** | Due dates, drag a to-do onto the calendar to block time for it |
| **Notes** | Real `.md` files on disk: lists, tables, pictures, `[[links]]` with backlinks, daily journal |
| **Budget** | Cash and account balances, monthly salary and bills, category limits, savings goals, insights |
| **Also** | Boards, habits, projects (git status), snippets, saved videos, world clocks, focus timer, Ctrl+P search, quick capture from anywhere (Ctrl+Shift+Space) |

![Calendar](docs/calendar.png)

## Getting started

The first launch asks for three things: the day your week starts on, your city (for weather and sunrise) and your currency. Everything can be changed later in **Settings**.

To add your classes, go to **Settings → Timetable → Add**, or open the calendar, click a class, then **Edit class**. If a classmate already did the work, use **Import…** with the file they exported.

![Timetable](docs/timetable.png)

## Your data

- Everything except notes is stored in `Documents\Fukurō\data.json`. If your Documents folder is in OneDrive, that file follows you to your other PCs.
- Notes are plain `.md` files in `Documents\Fukurō\Notes`. You can pick another folder in Settings.
- **Settings → Your data → Export** saves everything to a single file.

Fukurō has no account and no tracking. The only things that go online are:
- the weather: your city's coordinates are sent to [Open-Meteo](https://open-meteo.com);
- YouTube titles for links you save;
- the update check against GitHub.

## Build from source

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/k4zmx/Fukuro.git
cd Fukuro
npm install
npm start           # run it
npm run dist        # build the Windows installer into dist/
```

The app is plain HTML, CSS and JavaScript with no build step, wrapped in Electron. The scripts share one global scope, so run `npm run check` after changes: it catches two files declaring the same name.

To publish a release, run `npm run release`. It needs a GitHub token in `GH_TOKEN`, or the one git already uses for github.com. Bump `version` in `package.json` first.

## License

[MIT](LICENSE). The bundled [Commissioner](https://github.com/kosbarts/Commissioner) font is under the SIL Open Font License.
