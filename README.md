# Code Jam voting

Use this standalone app for the Nov 27 audience favorite and the official prize after the second Code Jam. Create one poll per vote. Each poll has its own link, QR code, codes and tally.

## Rehearse locally

1. Run `npm ci` from this folder.
2. Run `npm run dev`. Open <http://127.0.0.1:8787/host.html>.
3. Create a sample poll. Generate two codes, save two projects and open voting. Use two devices or tabs to vote. Try a code twice, then close the poll, open the projector screen and select **Reveal results**.

For a two-phone rehearsal on a trusted Wi-Fi network, run `npm run dev -- --ip 0.0.0.0` Open the host page using the laptop's LAN address so the QR code points to an address the phones can reach.

With the local Worker running, run `npm test`. The check creates two sample polls and verifies that one code cannot cast two votes or cross ballots, and that one poll's host key cannot control another poll. Set `POLL_TEST_URL` if you used a different local port.

## Run the votes

1. Use an HTTPS deployment of this Worker for the event (`npm run deploy`). It needs no secrets.
2. At each event, open `/host.html` and enter the poll title. Anyone can create a poll. The poll gets its own random host key, which this browser remembers. Copy the **Host link** and keep it private: it is the only way to run that poll from another device, and whoever has it can run the poll.
3. Generate and download enough codes for everyone voting. Give each attendee one code in private. Save the batch before reloading the host page. Attendees do not need a Discord account.
4. Select **Open the projector screen** on the host page and put that tab on the projector (press F for full screen, T for a light background in a bright room). It shows the poll title, the QR code and the voting state, and never the host key or codes. Keep the host page itself off the projector: it displays private codes.
5. Save the 2 to 50 eligible projects before voting. Select **Open voting** after the demos to lock the project list. No tally is shown anywhere while voting is open. When voting ends, select **Close voting** on the host page, then **Reveal results** (or press Space) on the projector screen. The screen reveals the rest of the list first, then 3rd, 2nd and 1st, and flags ties. With reduced motion turned on it shows the final ranking at once. Phones say to watch the big screen and only show the tally if the voter asks for it.
6. Create a fresh poll and issue fresh codes for the second jam's prize. Agree on eligibility and how to handle ties before voting opens.

Codes are single use and specific to one poll. Anyone who receives a code can use it. The app stores a hash and whether the code was used, plus aggregate vote counts. It does not collect voter names or store which project a code voted for.

## Host keys

Every poll has its own 256-bit host key, created by the server when the poll is created and returned once. The server stores only its SHA-256 hash, inside that poll's Durable Object, and checks it on every host action. A key from one poll never works on another. The host link carries the key after `#`, which browsers do not send to the server, and the host page removes it from the address bar once it has saved it.
