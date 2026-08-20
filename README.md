# VECTRENCH

A vector-graphics rails shooter for phones. Describe a canyon in plain language,
and the game builds it and lets you fly it.

Tilt the phone to move within the trench. You do not aim: the crosshair sits
where the nose points, and flying it across a target paints it. Touch anywhere
to fire the gun, and launch missiles at everything you have painted at once.

**[Play it](https://cfreder2.github.io/VECTRENCH/)** — no install, no account, nothing to download. It runs
from the page. Open it on a phone if you want the tilt controls.

## The pre-built levels

Four levels ship finished. The first is a tour: every element the game has, one
per stretch, at a speed you can read them at. The other three are the game
proper, in the order they are meant to be flown. They are hand-tuned specs
rather than parsed prose, so the seed is pinned and the run is the same every
time. Each opens almost empty — the first fifteen seconds is one obstacle and
barely a gun — and gets harder the whole way down. All four are machine-checked:
for a flyable line, and for taking between one and two minutes to fly (see
[Testing](#testing)).

| | Time to fly | Bulkheads | Speed | |
| --- | --- | --- | --- | --- |
| **[PROVING GROUND](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiUFJPVklORyBHUk9VTkQiLCJzZWVkIjoxNzAxLCJzcGVlZCI6eyJzdGFydCI6MjMwLCJlbmQiOjI5MH0sImZpbmFsZSI6InBvcnQiLCJzZWN0aW9ucyI6W3sibmFtZSI6Im9wZW4gYWlyIiwibGVuZ3RoIjoyMjAwLCJ3aWR0aCI6MTEyLCJkZXB0aCI6OTIsImN1cnZpbmVzcyI6MC4xLCJoaWxsaW5lc3MiOjAuMTUsInJvdWdobmVzcyI6MC4zLCJvYnN0YWNsZXMiOjAuMTQsImtpbmRzIjpbInB5bG9uIl0sInR1cnJldHMiOjAuMDgsImdhdGxpbmdzIjowLCJiYXR0ZXJpZXMiOjAsIndhbGxndW5zIjowLCJkcm9uZXMiOjAuMiwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjU1fSx7Im5hbWUiOiJzbGlkaW5nIHdhbGxzIiwibGVuZ3RoIjoyMjAwLCJ3aWR0aCI6MTA0LCJkZXB0aCI6MTAwLCJjdXJ2aW5lc3MiOjAuMTYsImhpbGxpbmVzcyI6MC4yLCJyb3VnaG5lc3MiOjAuMzQsIm9ic3RhY2xlcyI6MC41LCJraW5kcyI6WyJzbGlkZXIiXSwidHVycmV0cyI6MC4xMiwiZ2F0bGluZ3MiOjAuMDgsImJhdHRlcmllcyI6MCwid2FsbGd1bnMiOjAuMSwiZHJvbmVzIjowLjIsInNlYWxzIjowLCJwYW5lbHMiOjIsImh1ZSI6MC41fSx7Im5hbWUiOiJ0aGUgY3J1c2hlcnMiLCJsZW5ndGgiOjIyMDAsIndpZHRoIjoxMDAsImRlcHRoIjoxMDgsImN1cnZpbmVzcyI6MC4yLCJoaWxsaW5lc3MiOjAuMjQsInJvdWdobmVzcyI6MC4zOCwib2JzdGFjbGVzIjowLjUsImtpbmRzIjpbInByZXNzIl0sInR1cnJldHMiOjAuMTUsImdhdGxpbmdzIjowLjEsImJhdHRlcmllcyI6MC4wOCwid2FsbGd1bnMiOjAuMTQsImRyb25lcyI6MC4yMiwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjQ0fSx7Im5hbWUiOiJwaW53aGVlbHMiLCJsZW5ndGgiOjIyMDAsIndpZHRoIjo5OCwiZGVwdGgiOjExMiwiY3VydmluZXNzIjowLjI0LCJoaWxsaW5lc3MiOjAuMjYsInJvdWdobmVzcyI6MC40LCJvYnN0YWNsZXMiOjAuNSwia2luZHMiOlsicGlud2hlZWwiXSwidHVycmV0cyI6MC4xOCwiZ2F0bGluZ3MiOjAuMTIsImJhdHRlcmllcyI6MC4xLCJ3YWxsZ3VucyI6MC4xOCwiZHJvbmVzIjowLjI0LCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMzZ9LHsibmFtZSI6ImNyb3NzYmFycyIsImxlbmd0aCI6MjIwMCwid2lkdGgiOjk0LCJkZXB0aCI6MTE0LCJjdXJ2aW5lc3MiOjAuMjgsImhpbGxpbmVzcyI6MC4yOCwicm91Z2huZXNzIjowLjQyLCJvYnN0YWNsZXMiOjAuNSwia2luZHMiOlsiY3Jvc3MiXSwidHVycmV0cyI6MC4yLCJnYXRsaW5ncyI6MC4xNSwiYmF0dGVyaWVzIjowLjEyLCJ3YWxsZ3VucyI6MC4yLCJkcm9uZXMiOjAuMjQsInNlYWxzIjowLCJwYW5lbHMiOjIsImh1ZSI6MC4yOH0seyJuYW1lIjoidGhlIHJpbmdzIiwibGVuZ3RoIjoyMjAwLCJ3aWR0aCI6OTAsImRlcHRoIjoxMTgsImN1cnZpbmVzcyI6MC4zLCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ0LCJvYnN0YWNsZXMiOjAuNSwia2luZHMiOlsicmluZyJdLCJ0dXJyZXRzIjowLjIyLCJnYXRsaW5ncyI6MC4xOCwiYmF0dGVyaWVzIjowLjE1LCJ3YWxsZ3VucyI6MC4yMiwiZHJvbmVzIjowLjIyLCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMn0seyJuYW1lIjoidGhlIGdhdGVzIiwibGVuZ3RoIjoyMjAwLCJ3aWR0aCI6OTIsImRlcHRoIjoxMTgsImN1cnZpbmVzcyI6MC4zLCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ0LCJvYnN0YWNsZXMiOjAuNSwia2luZHMiOlsiZ2F0ZSJdLCJ0dXJyZXRzIjowLjIyLCJnYXRsaW5ncyI6MC4xOCwiYmF0dGVyaWVzIjowLjE1LCJ3YWxsZ3VucyI6MC4yMiwiZHJvbmVzIjowLjIyLCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMTZ9LHsibmFtZSI6ImZpcnN0IGJ1bGtoZWFkIiwibGVuZ3RoIjoyMjAwLCJ3aWR0aCI6ODYsImRlcHRoIjoxMjIsImN1cnZpbmVzcyI6MC4yNiwiaGlsbGluZXNzIjowLjI2LCJyb3VnaG5lc3MiOjAuNDIsIm9ic3RhY2xlcyI6MC4yLCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC4zNSwiZ2F0bGluZ3MiOjAuMywiYmF0dGVyaWVzIjowLjI1LCJ3YWxsZ3VucyI6MC4xNiwiZHJvbmVzIjowLjIsInNlYWxzIjoxLCJwYW5lbHMiOjMsImh1ZSI6MC4xNH0seyJuYW1lIjoidGhlIGRlZmVuZGVkIHN1cmZhY2UiLCJsZW5ndGgiOjIyMDAsIndpZHRoIjo4MiwiZGVwdGgiOjEyNiwiY3VydmluZXNzIjowLjMsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNDUsIm9ic3RhY2xlcyI6MC40LCJraW5kcyI6WyJzdGFjayJdLCJ0dXJyZXRzIjowLjU1LCJnYXRsaW5ncyI6MC41LCJiYXR0ZXJpZXMiOjAuNDUsIndhbGxndW5zIjowLjMsImRyb25lcyI6MC4yNCwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjA4fSx7Im5hbWUiOiJzZWNvbmQgYnVsa2hlYWQiLCJsZW5ndGgiOjIyMDAsIndpZHRoIjo4MCwiZGVwdGgiOjEyOCwiY3VydmluZXNzIjowLjMsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNDUsIm9ic3RhY2xlcyI6MC4yLCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC41LCJnYXRsaW5ncyI6MC40NSwiYmF0dGVyaWVzIjowLjQsIndhbGxndW5zIjowLjIsImRyb25lcyI6MC4yNCwic2VhbHMiOjEsInBhbmVscyI6NCwiaHVlIjowLjA1fSx7Im5hbWUiOiJydW4gdG8gdGhlIHBvcnQiLCJsZW5ndGgiOjIyMDAsIndpZHRoIjo4MCwiZGVwdGgiOjEyMCwiY3VydmluZXNzIjowLjMsImhpbGxpbmVzcyI6MC4yNiwicm91Z2huZXNzIjowLjQyLCJvYnN0YWNsZXMiOjAuNDIsImtpbmRzIjpbImZhbmciLCJnYXRlIiwicGlud2hlZWwiXSwidHVycmV0cyI6MC4zLCJnYXRsaW5ncyI6MC4yNSwiYmF0dGVyaWVzIjowLjIsIndhbGxndW5zIjowLjI4LCJkcm9uZXMiOjAuMiwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjAyfV19)** | ~100s | 2 | 230-290 | One of everything, one per stretch, slow enough to read. Sliding walls, crushers, pinwheels, crossbars, rings, gates, stacks, two bulkheads you can open by shooting their panels instead of climbing, and a surface that is defended from the second minute on. It is the level to fly when you have changed something and want to see it. |
| **[SHAKEDOWN](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiU0hBS0VET1dOIiwic2VlZCI6NDIxMSwic3BlZWQiOnsic3RhcnQiOjIzMCwiZW5kIjozMDB9LCJmaW5hbGUiOiJwb3J0Iiwic2VjdGlvbnMiOlt7Im5hbWUiOiJvcGVuIGFwcHJvYWNoIiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6MTEyLCJkZXB0aCI6ODgsImN1cnZpbmVzcyI6MC4wOCwiaGlsbGluZXNzIjowLjE1LCJyb3VnaG5lc3MiOjAuMywib2JzdGFjbGVzIjowLjEsImtpbmRzIjpbInB5bG9uIl0sInR1cnJldHMiOjAsImdhdGxpbmdzIjowLCJiYXR0ZXJpZXMiOjAsIndhbGxndW5zIjowLCJkcm9uZXMiOjAuMTUsInNlYWxzIjowLCJwYW5lbHMiOjIsImh1ZSI6MC41fSx7Im5hbWUiOiJmaXJzdCBjb2x1bW5zIiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6MTAwLCJkZXB0aCI6OTYsImN1cnZpbmVzcyI6MC4xOCwiaGlsbGluZXNzIjowLjIyLCJyb3VnaG5lc3MiOjAuMzYsIm9ic3RhY2xlcyI6MC4yMiwia2luZHMiOlsicHlsb24iXSwidHVycmV0cyI6MC4xLCJnYXRsaW5ncyI6MCwiYmF0dGVyaWVzIjowLCJ3YWxsZ3VucyI6MCwiZHJvbmVzIjowLjI1LCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuNX0seyJuYW1lIjoidGhlIGJlbmQiLCJsZW5ndGgiOjMwMDAsIndpZHRoIjo4OCwiZGVwdGgiOjEwOCwiY3VydmluZXNzIjowLjM4LCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQyLCJvYnN0YWNsZXMiOjAuMywia2luZHMiOlsicHlsb24iLCJmYW5nIl0sInR1cnJldHMiOjAuMTgsImdhdGxpbmdzIjowLjEsImJhdHRlcmllcyI6MCwid2FsbGd1bnMiOjAuMTIsImRyb25lcyI6MC4yOCwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjUxfSx7Im5hbWUiOiJoYW5naW5nIGZhbmdzIiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6ODAsImRlcHRoIjoxMTYsImN1cnZpbmVzcyI6MC40MiwiaGlsbGluZXNzIjowLjM1LCJyb3VnaG5lc3MiOjAuNDYsIm9ic3RhY2xlcyI6MC4zOCwia2luZHMiOlsicHlsb24iLCJmYW5nIl0sInR1cnJldHMiOjAuMjUsImdhdGxpbmdzIjowLjE4LCJiYXR0ZXJpZXMiOjAuMSwid2FsbGd1bnMiOjAuMiwiZHJvbmVzIjowLjMsInNlYWxzIjowLCJwYW5lbHMiOjIsImh1ZSI6MC41MX0seyJuYW1lIjoib25lIGJ1bGtoZWFkIiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6NzQsImRlcHRoIjoxMjQsImN1cnZpbmVzcyI6MC4zNiwiaGlsbGluZXNzIjowLjMyLCJyb3VnaG5lc3MiOjAuNDUsIm9ic3RhY2xlcyI6MC4zLCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC41LCJnYXRsaW5ncyI6MC4zLCJiYXR0ZXJpZXMiOjAuMjUsIndhbGxndW5zIjowLjE4LCJkcm9uZXMiOjAuMjUsInNlYWxzIjoxLCJwYW5lbHMiOjMsImh1ZSI6MC41Mn0seyJuYW1lIjoicnVuIHRvIHRoZSBwb3J0IiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6NjgsImRlcHRoIjoxMjAsImN1cnZpbmVzcyI6MC40LCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ1LCJvYnN0YWNsZXMiOjAuMzYsImtpbmRzIjpbImZhbmciLCJnYXRlIl0sInR1cnJldHMiOjAuMywiZ2F0bGluZ3MiOjAuMjIsImJhdHRlcmllcyI6MC4xNSwid2FsbGd1bnMiOjAuMywiZHJvbmVzIjowLjIsInNlYWxzIjowLCJwYW5lbHMiOjIsImh1ZSI6MC41Mn1dfQ)** | ~75s | 1 | 230-300 | The first minute of this game. It opens almost empty and wide on purpose: nothing shoots at you until you have flown a while, and the one bulkhead waits until you have already learned to climb. |
| **[BULKHEAD RUN](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiQlVMS0hFQUQgUlVOIiwic2VlZCI6OTAyMTAsInNwZWVkIjp7InN0YXJ0IjoyNjAsImVuZCI6NDMwfSwiZmluYWxlIjoicG9ydCIsInNlY3Rpb25zIjpbeyJuYW1lIjoid2lkZSBtb3V0aCIsImxlbmd0aCI6NDM1MCwid2lkdGgiOjExOCwiZGVwdGgiOjExMCwiY3VydmluZXNzIjowLjEyLCJoaWxsaW5lc3MiOjAuMiwicm91Z2huZXNzIjowLjM1LCJvYnN0YWNsZXMiOjAuMTIsImtpbmRzIjpbInB5bG9uIl0sInR1cnJldHMiOjAuMDUsImdhdGxpbmdzIjowLCJiYXR0ZXJpZXMiOjAsIndhbGxndW5zIjowLCJkcm9uZXMiOjAuMiwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjEzfSx7Im5hbWUiOiJmaXJzdCBuYXJyb3dpbmciLCJsZW5ndGgiOjQzNTAsIndpZHRoIjo5NiwiZGVwdGgiOjEyOCwiY3VydmluZXNzIjowLjMsImhpbGxpbmVzcyI6MC4yOCwicm91Z2huZXNzIjowLjQ1LCJvYnN0YWNsZXMiOjAuMjYsImtpbmRzIjpbInB5bG9uIiwiZmFuZyJdLCJ0dXJyZXRzIjowLjE1LCJnYXRsaW5ncyI6MC4xMiwiYmF0dGVyaWVzIjowLjA4LCJ3YWxsZ3VucyI6MC4xMiwiZHJvbmVzIjowLjI1LCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMTN9LHsibmFtZSI6InRoZSBuYXJyb3dzIiwibGVuZ3RoIjo0MzUwLCJ3aWR0aCI6NzQsImRlcHRoIjoxNDUsImN1cnZpbmVzcyI6MC41LCJoaWxsaW5lc3MiOjAuNCwicm91Z2huZXNzIjowLjUyLCJvYnN0YWNsZXMiOjAuNCwia2luZHMiOlsicHlsb24iLCJmYW5nIiwiZ2F0ZSJdLCJ0dXJyZXRzIjowLjMsImdhdGxpbmdzIjowLjI4LCJiYXR0ZXJpZXMiOjAuMjIsIndhbGxndW5zIjowLjMsImRyb25lcyI6MC4zLCJzZWFscyI6MSwicGFuZWxzIjozLCJodWUiOjAuMTJ9LHsibmFtZSI6ImRlZXAgd2F0ZXIiLCJsZW5ndGgiOjQzNTAsIndpZHRoIjo2MiwiZGVwdGgiOjE1OCwiY3VydmluZXNzIjowLjYyLCJoaWxsaW5lc3MiOjAuNDUsInJvdWdobmVzcyI6MC41OCwib2JzdGFjbGVzIjowLjQ4LCJraW5kcyI6WyJmYW5nIiwiZ2F0ZSIsInNsaWRlciJdLCJ0dXJyZXRzIjowLjQ1LCJnYXRsaW5ncyI6MC40LCJiYXR0ZXJpZXMiOjAuMzUsIndhbGxndW5zIjowLjQsImRyb25lcyI6MC4yOCwic2VhbHMiOjEsInBhbmVscyI6MiwiaHVlIjowLjExfSx7Im5hbWUiOiJzZWFsZWQgZGVlcCIsImxlbmd0aCI6NDM1MCwid2lkdGgiOjU0LCJkZXB0aCI6MTY4LCJjdXJ2aW5lc3MiOjAuNjYsImhpbGxpbmVzcyI6MC40OCwicm91Z2huZXNzIjowLjYsIm9ic3RhY2xlcyI6MC40NCwia2luZHMiOlsiZmFuZyIsImdhdGUiLCJyaW5nIl0sInR1cnJldHMiOjAuNiwiZ2F0bGluZ3MiOjAuNTUsImJhdHRlcmllcyI6MC41NSwid2FsbGd1bnMiOjAuMzUsImRyb25lcyI6MC4yNCwic2VhbHMiOjEsInBhbmVscyI6MiwiaHVlIjowLjF9LHsibmFtZSI6InRoZSBjaG9rZSIsImxlbmd0aCI6NDM1MCwid2lkdGgiOjQ0LCJkZXB0aCI6MTU2LCJjdXJ2aW5lc3MiOjAuNSwiaGlsbGluZXNzIjowLjM1LCJyb3VnaG5lc3MiOjAuNTIsIm9ic3RhY2xlcyI6MC41LCJraW5kcyI6WyJyaW5nIiwiZ2F0ZSIsInByZXNzIl0sInR1cnJldHMiOjAuMzUsImdhdGxpbmdzIjowLjQ1LCJiYXR0ZXJpZXMiOjAuNCwid2FsbGd1bnMiOjAuNDUsImRyb25lcyI6MC4yLCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMDl9LHsibmFtZSI6Imxhc3QgbGlnaHQiLCJsZW5ndGgiOjQzNTAsIndpZHRoIjo0MCwiZGVwdGgiOjE1MCwiY3VydmluZXNzIjowLjQyLCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ4LCJvYnN0YWNsZXMiOjAuNDUsImtpbmRzIjpbInJpbmciLCJwaW53aGVlbCJdLCJ0dXJyZXRzIjowLjMsImdhdGxpbmdzIjowLjM1LCJiYXR0ZXJpZXMiOjAuMywid2FsbGd1bnMiOjAuNCwiZHJvbmVzIjowLjE4LCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMDh9XX0)** | ~95s | 3 | 260-430 | The brief this game was built to. A wide mouth that narrows for the rest of your life, sealed three times, with the surface guns waiting every time you are forced over the rim. |
| **[REACTOR](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiUkVBQ1RPUiIsInNlZWQiOjY2NjEzLCJzcGVlZCI6eyJzdGFydCI6MzAwLCJlbmQiOjUwMH0sImZpbmFsZSI6InBvcnQiLCJzZWN0aW9ucyI6W3sibmFtZSI6InRoZSBkZXNjZW50IiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6MTAwLCJkZXB0aCI6MTMwLCJjdXJ2aW5lc3MiOjAuMTUsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNSwib2JzdGFjbGVzIjowLjE0LCJraW5kcyI6WyJweWxvbiJdLCJ0dXJyZXRzIjowLjA4LCJnYXRsaW5ncyI6MC4wNSwiYmF0dGVyaWVzIjowLCJ3YWxsZ3VucyI6MCwiZHJvbmVzIjowLjI1LCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMDJ9LHsibmFtZSI6ImludG8gdGhlIHJlZCIsImxlbmd0aCI6NTIwMCwid2lkdGgiOjgyLCJkZXB0aCI6MTUwLCJjdXJ2aW5lc3MiOjAuMzUsImhpbGxpbmVzcyI6MC40NSwicm91Z2huZXNzIjowLjYsIm9ic3RhY2xlcyI6MC4zLCJraW5kcyI6WyJweWxvbiIsInN0YWNrIiwic2xpZGVyIl0sInR1cnJldHMiOjAuMiwiZ2F0bGluZ3MiOjAuMiwiYmF0dGVyaWVzIjowLjE1LCJ3YWxsZ3VucyI6MC4yLCJkcm9uZXMiOjAuMywic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjAyfSx7Im5hbWUiOiJzbGFiIGZpZWxkIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NjYsImRlcHRoIjoxNjgsImN1cnZpbmVzcyI6MC41LCJoaWxsaW5lc3MiOjAuNTUsInJvdWdobmVzcyI6MC42NSwib2JzdGFjbGVzIjowLjQ1LCJraW5kcyI6WyJzdGFjayIsInB5bG9uIl0sInR1cnJldHMiOjAuMywiZ2F0bGluZ3MiOjAuMzUsImJhdHRlcmllcyI6MC4zLCJ3YWxsZ3VucyI6MC4zNSwiZHJvbmVzIjowLjM1LCJzZWFscyI6MSwicGFuZWxzIjozLCJodWUiOjAuMDF9LHsibmFtZSI6ImdhdW50bGV0IiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NTYsImRlcHRoIjoxODAsImN1cnZpbmVzcyI6MC42NSwiaGlsbGluZXNzIjowLjU1LCJyb3VnaG5lc3MiOjAuNjUsIm9ic3RhY2xlcyI6MC41NSwia2luZHMiOlsic3RhY2siLCJnYXRlIiwicHJlc3MiXSwidHVycmV0cyI6MC40NSwiZ2F0bGluZ3MiOjAuNSwiYmF0dGVyaWVzIjowLjQ1LCJ3YWxsZ3VucyI6MC40NSwiZHJvbmVzIjowLjM1LCJzZWFscyI6MCwicGFuZWxzIjoyLCJodWUiOjAuMDF9LHsibmFtZSI6InNlYWxlZCBjb3JlIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NTAsImRlcHRoIjoxOTIsImN1cnZpbmVzcyI6MC43LCJoaWxsaW5lc3MiOjAuNSwicm91Z2huZXNzIjowLjYsIm9ic3RhY2xlcyI6MC41LCJraW5kcyI6WyJnYXRlIiwiZmFuZyIsInJpbmciXSwidHVycmV0cyI6MC42MiwiZ2F0bGluZ3MiOjAuNjIsImJhdHRlcmllcyI6MC43LCJ3YWxsZ3VucyI6MC40MiwiZHJvbmVzIjowLjMsInNlYWxzIjoyLCJwYW5lbHMiOjQsImh1ZSI6MC4wMX0seyJuYW1lIjoiaXJpcyBjaGFpbiIsImxlbmd0aCI6NTIwMCwid2lkdGgiOjQ0LCJkZXB0aCI6MTk2LCJjdXJ2aW5lc3MiOjAuNzUsImhpbGxpbmVzcyI6MC40NSwicm91Z2huZXNzIjowLjU1LCJvYnN0YWNsZXMiOjAuNTUsImtpbmRzIjpbInJpbmciLCJnYXRlIiwicGlud2hlZWwiXSwidHVycmV0cyI6MC41NSwiZ2F0bGluZ3MiOjAuNywiYmF0dGVyaWVzIjowLjYsIndhbGxndW5zIjowLjUsImRyb25lcyI6MC4yOCwic2VhbHMiOjAsInBhbmVscyI6MiwiaHVlIjowLjA0fSx7Im5hbWUiOiJsYXN0IGJ1bGtoZWFkIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NDAsImRlcHRoIjoxOTAsImN1cnZpbmVzcyI6MC42LCJoaWxsaW5lc3MiOjAuNCwicm91Z2huZXNzIjowLjU1LCJvYnN0YWNsZXMiOjAuNSwia2luZHMiOlsicmluZyIsImNyb3NzIl0sInR1cnJldHMiOjAuNiwiZ2F0bGluZ3MiOjAuNzUsImJhdHRlcmllcyI6MC44LCJ3YWxsZ3VucyI6MC41LCJkcm9uZXMiOjAuMjYsInNlYWxzIjoxLCJwYW5lbHMiOjMsImh1ZSI6MC4wM30seyJuYW1lIjoiY29yZSBhcHByb2FjaCIsImxlbmd0aCI6NTIwMCwid2lkdGgiOjM2LCJkZXB0aCI6MTgwLCJjdXJ2aW5lc3MiOjAuNDIsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNDUsIm9ic3RhY2xlcyI6MC40Miwia2luZHMiOlsicmluZyJdLCJ0dXJyZXRzIjowLjQsImdhdGxpbmdzIjowLjYsImJhdHRlcmllcyI6MC41LCJ3YWxsZ3VucyI6MC41LCJkcm9uZXMiOjAuMjIsInNlYWxzIjowLCJwYW5lbHMiOjIsImh1ZSI6MH1dfQ)** | ~110s | 4 | 300-500 | Everything at once, on fire, at speed. It still starts gently -- then staggered slabs, an iris chain, four bulkheads, and a core that will not open until you hold the lock. |

They are also the first row of buttons in the game, and they live as plain JSON
in [`levels/`](levels) — read them, copy one, change a number. That is the whole
authoring format.

## Running it locally

It is a static page with no build step and no dependencies. Serve the directory
over HTTP (ES modules do not load from `file://`) and open it:

```bash
git clone https://github.com/cfreder2/VECTRENCH.git
cd VECTRENCH
python3 -m http.server 8000     # or: npx http-server -p 8000
```

Then open `http://<your-machine>:8000/` on the phone. Tap **TAP TO BEGIN** — that
first gesture is what lets the browser grant motion access and start audio, both
of which require a user gesture. Use **CALIBRATE TILT** while holding the phone
the way you intend to play; that posture becomes neutral.

**Tilt is relative, not absolute.** Neutral is whatever posture you are holding
when a run starts — there is no "upright", and lying on your back works as well
as sitting up. The game takes that neutral as soon as the phone is *still*
rather than the instant you press FLY IT, because pressing FLY IT is also when
it asks for landscape and half the time you are mid-turn; it shows **HOLD THE
PHONE STEADY** until it has one. **CALIBRATE TILT** on the setup panel re-takes
it whenever you want.

No tilt sensor, or permission denied? Drag one finger to steer and touch with a
second to fire. On a desktop, arrow keys or WASD steer, click or SPACE fires, and
SHIFT or M launches.

## The idea

Inside the trench you dodge geometry. Above the rim you are safe from geometry
but exposed to surface batteries — and only up there can you see them well
enough to shoot back.

A **bulkhead** is the solid red wall that seals the trench from floor to rim.
Chevrons climb its face in sequence to say which way out is, the HUD calls it
**3.6 seconds out** — timed rather than measured in distance, because a fixed
distance gets shorter exactly as a level gets faster — and it stays red until
you are actually above the lip, at which point it flips to **BULKHEAD — CLEAR**.

Or you can open it. Every bulkhead carries **control panels** on its face, one
to four of them, and shooting the last one drops the whole wall into the floor
and lets you keep your altitude. That is the decision: climb into the guns, or
stay low and spend the seconds and the fire it takes to break it open. Levels
can weld one shut with no panels at all, and then over the top is the only way. Several times a run the trench is sealed by a
bulkhead and the only way through is over the top — into the guns. That trade is
the game.

The run ends at an exhaust port that guns will not breach. It is a missile
target and nothing else, so the last thing a run asks of you is the thing every
gun on the way there was teaching: put the crosshair on it, and launch.

## What is up there

Above the rim is not empty and it is not a safe lane. Three things live on the
surface, all of them killable and none of them cheap:

- **Turrets** — plain guns, the baseline.
- **Gatlings** — rotary cannon that spin up in plain sight before hosing the rim
  with tracer. The spin-up is the only warning, and it is deliberately long
  enough to duck back under, because that is the decision the surface exists to
  keep asking.
- **Missile batteries** — hulls on the skyline carrying a grid of vertical
  launch cells, in 1, 2, 3, 6 and 12 tube variants. A battery empties its rack
  one tube at a time rather than all at once, so twelve missiles arrive as a
  stream you have to keep answering. The seekers turn slower than you can bank
  and can be shot out of the air, so a full rack has several answers — but
  standing still is not one of them.

All of it only engages a ship that has broken the rim. Down in the trench the
surface is silent; the moment you climb, it is not. That is the whole trade,
and it is why every bulkhead has a battery and a gatling waiting on it.

Shields work the same way round. They recover **only below the rim**, and only
after a few seconds without being hit — so the trench is not merely where the
guns cannot reach you, it is where you get well again. Staying up top costs you
the one place that heals.

## Weapons

There is no aiming. The marker sits on the ship's nose — literally, it is a
point seven hundred units down the ship's forward axis, projected — so steering
swings it across the frame and holding a turn holds it out to one side. Putting
it on something is a flying problem, which is the problem the game is already
about. It is drawn as a pair of brackets sized to the range of whatever it is
over, so a marker on something far away is small and one on something close
fills the frame.

Anything the marker rests on is painted, and a painted target is locked until
you spend it — but only if you can actually see it. Wireframe has no occlusion,
so without a sight test the rock in front of you hides nothing and a turret on
the surface could be painted from the trench floor, through a wall. Sight is
checked against the canyon itself, which means the surface batteries cannot be
answered from cover: to paint them you have to break the rim, and breaking the
rim is what puts you in their fire. The trade the level design is built on is
the same trade the targeting enforces.

Locks survive losing sight, though. Climb, paint what is up there, drop back
into the trench and launch from cover — the missiles will go over the top. The
exposure was already paid for.

**The gun** fires while you touch the screen, anywhere. Ammunition is infinite
and heat is not: about two and a half seconds of held fire overheats it, and it
will not fire again until it has cooled most of the way back. It is the answer
to whatever is in front of you right now.

**Missiles** cost nothing to fire and never miss, but everything they hit has
to be painted first. Up to eight locks are held at once and a launch spends all
of them simultaneously, then the launcher reloads for five seconds. It is the
answer to a group — a drone wave, or the cover fire waiting above a bulkhead —
and the five seconds is why you cannot make it the answer to everything.

The two weapons are shaped as opposites on purpose. The gun is always available
and always costs something; missiles cost nothing at the moment you fire them
and everything in the twenty seconds of flying it took to line them up.

## Making a level

**[docs/LEVELS.md](docs/LEVELS.md) is the full authoring guide** — the whole prose
vocabulary, every spec field and its range, the rules the compiler enforces, and
how to add a level of your own to the game. What follows is the short version.

### Describing one

Type a description and press **BUILD**. Prose is split on sequence markers
("then", "after that", "finally") and each segment becomes one section of the
run, flown in order. So:

> Start wide and open, then tighten into a deep twisting trench packed with
> hanging fangs and irises, seal it twice with heavy turret cover on the
> surface, finish with a narrow choke and an exhaust port.

The vocabulary covers width (`tight`, `cavernous`, `claustrophobic`), depth
(`shallow`, `bottomless chasm`), turning (`straight`, `serpentine`, `hairpin`),
relief (`flat`, `rolling`, `hilly`), density (`sparse`, `wall to wall`),
obstacles (`columns`, `stalactites`, `bulkheads`, `irises`, `staggered slabs`),
enemies (`turrets`, `wall guns`, `drones`), bulkheads (`sealed three times`),
speed (`ludicrous speed`), colour (`molten red`, `icy blue`, `toxic green`), and
length (`short`, `long`, `for 2000 units`). Intensifiers work: `very tight` is
tighter than `tight`. Explicit numbers win over adjectives.

**BUILD** shows you what it understood and, below the plan and elevation
schematic, what it actually placed. **SCHEMATIC** collapses the panel so you can
study the whole run before flying it. **RESEED** keeps the shape and re-rolls
placement. **COPY LINK** puts the entire level in the URL, so a level is a link.

### Writing one by hand

Prose is a way in, not the format. A level is a spec — plain JSON, every field
clamped — and you can write one directly instead:

```bash
$EDITOR levels/my-level.json     # copy one of the three and change numbers
node tools/levels.mjs --sync     # compile levels/ into src/levels.js
node tools/levels.mjs            # prove it is flyable, print its share link
```

It then appears as a button in the game alongside the other three.
[docs/LEVELS.md](docs/LEVELS.md#2-write-the-spec) documents every field.

### Using Claude instead

The offline parser understands a fixed vocabulary and always works, including
with no network. Ticking **USE CLAUDE** sends your prose to Claude instead, which
fills in the same level spec from arbitrary description. It needs an Anthropic
API key, which is stored only in your browser's localStorage and sent only to
Anthropic's API from your own device. If the call fails for any reason the game
falls back to the offline parser and still gives you a level.

This path loads the official SDK from a CDN on demand, so it is the one feature
that needs network access. The game itself never does.

## How it fits together

```
prose ──> nl.js  (offline grammar)  ──┐
                                      ├──> spec (JSON) ──> track.js  ──> geometry
prose ──> llm.js (Claude, optional) ──┘        │           level.js  ──> obstacles, enemies, port
                                               └──> URL hash, so a spec is shareable
```

The spec is the contract. Everything upstream of it is a front-end, everything
downstream consumes it, and `spec.js` clamps every field — so a spec from a link,
a model, or a typo can be strange but never unplayable.

| File | Owns |
| --- | --- |
| `spec.js` | The level spec: fields, ranges, clamping, URL encoding, examples |
| `levels.js` | The pre-built levels. Generated from `levels/*.json` — do not edit |
| `nl.js` | Prose → spec, offline, deterministic |
| `llm.js` | Prose → spec via Claude (optional) |
| `track.js` | Spec → canyon geometry; the rail, widths, rim heights |
| `level.js` | Spec → obstacles, guns, drone waves, the port |
| `terrain.js` | Drawing the canyon |
| `entities.js` | Ship, obstacles, enemies, projectiles, particles |
| `game.js` | Physics, camera, collision, enemy fire, both weapons, scoring |
| `collide.js` | Swept segment-sphere tests, and the moving-obstacle transform |
| `renderer.js` | The vector display: batched glowing lines, phosphor trails |
| `hud.js` | HUD and the level schematic |
| `font.js` | Stroke font |
| `input.js` | Tilt, touch, keyboard |
| `audio.js` | Synthesised sound, no samples |
| `music.js` | Flight of the Bumblebee, played on square waves |
| `ui.js` | Screens and the authoring panel |
| `main.js` | Bootstrap and the frame loop |

Outside `src/`: [`levels/`](levels) holds the pre-built levels as plain spec
JSON — the source of truth for them — and `tools/levels.mjs` compiles that
directory into `src/levels.js`, because the single-file build has no directory
to read at runtime.

### Rendering

Everything visible is a glowing line segment. Segments are transformed and
near-clipped on the CPU, emitted as screen-space quads into one buffer, and drawn
in a single additive pass. Additive blending is order-independent, so there is no
depth buffer and no sorting. The scene renders into a framebuffer that is only
partly faded each frame; that leftover light is the phosphor trail, and it does
most of the work of selling speed.

Wireframe has no occlusion, so the surface deck is faded by altitude: below the
rim you cannot see the plane a solid renderer would hide behind rock, and
breaking the rim reveals it.

## Testing

`tools/audit.mjs` is a fairness check, not a smoke test: it walks a compiled
level and runs a reachability search over the trench cross-section at each
obstacle, using the ship's real lateral and vertical speed limits, to prove a
flyable line exists. Run it over a spread of seeds before changing the generator.

```bash
node tools/audit.mjs            # clearability across the prose examples and 60 seeds
node tools/levels.mjs           # the same proof over each pre-built level, plus 40 reseeds
node tools/levels.mjs --check   # src/levels.js still matches levels/*.json
```

The second one is the gate on a pre-built level. It checks four things and exits
non-zero on any of them:

- a flyable line exists on the shipped seed, and under 40 **other** seeds too,
  because **RESEED** re-rolls the seed in play — a shape that is only clearable
  on the seed it shipped with is a shape that will betray somebody
- the level takes between 60 and 135 seconds to fly
- every authored bulkhead actually got placed (the compiler caps them at one per
  2600 units of section)
- `src/levels.js` still matches `levels/*.json`

The reachability search runs against `MAX_VX` and `MAX_VY` imported from
`game.js` rather than copies, so making the ship faster re-proves the levels
instead of quietly invalidating the proof.

## Single-file build

`dist/vectrench.html` is the whole game inlined into one file — open it directly
from disk, no server needed. Rebuild it after changing anything under `src/`:

```bash
node tools/levels.mjs --sync    # only if levels/*.json changed
node tools/bundle.mjs
```

The bundler is a concatenator, not a real bundler: it emits the modules in
dependency order into one scope with imports and exports stripped. It aborts if
two modules declare the same top-level name, so the shortcut stays honest.

Two things in it are load-order-sensitive rather than merely tidy, and both would
fail silently if reordered: `game.js` reads `CANYON` from `terrain.js` at
definition time, and `llm.js` builds its system prompt from `spec.js`'s `FIELDS`
at definition time. Top-level `const` is not hoisted.
