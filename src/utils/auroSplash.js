import figlet from "figlet";
import { mind } from "gradient-string";

export default () => {
  return mind(figlet.textSync("Auro CLI"));
};
