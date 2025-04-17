import { mind } from "gradient-string";
import figlet from "figlet";

export default () => {
  return mind(figlet.textSync("Auro CLI"));
};
