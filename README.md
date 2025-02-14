# capricorn

A capability URL HTTP server that allows creating secure, transformed request forwarding.

## Features

- Create capability URLs that forward requests to destination URLs
- Transform requests using custom JavaScript functions
- Secure access through randomly generated capability IDs

## Usage

### Create a New Capability

POST to `/create-capability` with a JSON body containing:

- `destinationUrl`: The URL where requests should be forwarded
- `transformFunction`: A JavaScript function that transforms the request

Example:

```javascript
{
  "destinationUrl": "https://api.example.com/data",
  "transformFunction": "function(req) { return { headers: { 'X-Custom': 'value' }, body: req.body }; }"
}
```

The server will return a capability URL. When requests are made to this URL, they will be:
1. Transformed using your provided function
2. Forwarded to the destination URL
3. Responses will be returned to the original requester

### Using Capability URLs

Simply make HTTP requests to the generated capability URL. The server will:
1. Transform the request using your function
2. Forward it to the destination
3. Return the response

## Security

Each capability URL contains a unique, random identifier. Only requests with valid capability IDs will be processed.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database:
```bash
# Create database (run this once)
createdb capricorn

# If you get permissions errors:
# sudo -u postgres createdb capricorn
```

3. Set environment variables:
- Create `.env` file with:
```
DATABASE_URL=postgres://localhost:5432/capricorn
```

4. Start the server:
```bash
npm start
```