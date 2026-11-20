export default {
  async fetch(request) {
    return new Response("Google Link Reporter Aktif!", {
      headers: { "content-type": "text/plain" }
    });
  }
};
