import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Cookie-based auth: the backend sets an httpOnly cookie on login/signup/mfa/google.
// `withCredentials: true` makes the browser send that cookie on every request.
export const api = axios.create({ baseURL: API, withCredentials: true });
