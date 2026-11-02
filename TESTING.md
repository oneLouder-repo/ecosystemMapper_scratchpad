# Testing Dashi

For the people running a test round, and for testers who like a written brief. Testers also get all of this inside Dashi, under **Help → Testing Dashi (alpha)**.

## Two ways to test

**On your own computer.** `npm install` is not needed. Run `npm start` and open http://localhost:5173. The test sign-in lists everyone in the six example orgs, so you can be the platform admin, an org admin, a lead, staff or a viewer with one click. This is the easiest way to try the multi-user parts alone: sign in as one person in one browser, and as another in a private window.

**On the staging server.** A hosted copy with test sign-in and the example orgs, behind an access code (see [DEPLOY.md](DEPLOY.md#a-staging-server-for-testers)). Send testers the address and the code. Everything there is test data and can be wiped.

## What to try

Each round, pick a few. Testers don't need to do them all.

1. **Sign in as different people.** An admin, a staff member and a viewer in the same org. Do they each see what they should, and nothing more? Try changing your own profile as staff.
2. **Two people, one document.** Two windows, two people, the same plan or map. Edit in one; does the other update? Edit in both at once; do you get the reload prompt instead of losing work?
3. **Map an ecosystem.** Add actors and connectors, switch lenses, use the Panels menu to dock, float and tidy the tool panels. Save the map to the library, then open it again from there.
4. **A week of reading.** In the Library, use **Add a reading** for a few papers or links: annotate, tag, file them in a bibliography. Open the week, lay the brief out by STEEPLE, write a short state of play and a recommendation.
5. **Plan some work.** In Strategy & Work, add a goal, a workplan and tasks; drag task bars on the Gantt chart; attach a map or a library item as an asset.
6. **Publish something.** Build a dashboard in the Workbench and put it on a public site.
7. **Invite someone.** As an org admin, add a person in Organisation → People and send them an invitation. Follow the link (on a server without email, it is in the server log).
8. **Phone width.** Try any of the above on a phone.

## Reporting

Use the **Feedback** button at the bottom right of every page. Choose problem, question or idea, say what you were doing and what you expected, and leave "include technical details" ticked. Replies arrive in **Help → Support** (and by email when the server sends email).

The platform admin works the queue in **Platform admin → Support**: set status and priority, reply, add internal notes (testers never see these), and mark tickets resolved.

## Before each round

- Note the version on the **alpha** badge (or `/version`) so reports can be matched to it.
- Reset staging if you want a clean start: stop it, delete its volume's `toolbox.db`, start it again. The example orgs come back.
- Check the support queue is empty, or at least triaged.

## Automated tests

`npm test` runs the unit and server tests (Node's own test runner, no installs). Run it before every pull request.
