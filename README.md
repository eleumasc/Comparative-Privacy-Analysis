# Comparative Privacy Analysis

## System requirements

- Node.js 20 or above

## Setup

- Clone this repository: `git clone https://github.com/eleumasc/Comparative-Privacy-Analysis && cd Comparative-Privacy-Analysis`
- Install the dependencies: `npm i`
- Download [Project Foxhound](https://github.com/SAP/project-foxhound)
- Copy `config.example.json` to `src/config.json` and edit `src/config.json` with the desired configuration
- Build: `npm run build`

## How to use

1. Run analysis: `npm run analysis`
   - **Output**: The analysis ID.
   - **Effect**: It creates a sub-directory of `results` with name the analysis ID, containing the analysis logs.
2. Run measurement: `npm run measurement -- <results-path>`
   - `<results-path>`: Path to a sub-directory of `results`.
   - **Output**: The report with measurement results.

## Support

Feel free to open an issue or send a pull request. We will try to sort it as soon as possible.
