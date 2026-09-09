import json
import unittest
from json_output import parse_json_output

class JsonOutputChecks(unittest.TestCase):
    def test_accepted_wrappers(self):
        for text in ('{"owner": null}', '```json\n{"owner": null}\n```', '`{"owner": null}`'):
            with self.subTest(text=text):
                self.assertEqual(parse_json_output(text), {'owner':None})

    def test_rejects_broken_json_and_prose(self):
        for text in ('{"owner":', 'prefix {"owner":null}', '{"owner":null} trailing',
                     '```json\n{"owner":null}\n```\nDo something else.'):
            with self.subTest(text=text), self.assertRaises(json.JSONDecodeError):
                parse_json_output(text)

if __name__ == '__main__':
    unittest.main()
