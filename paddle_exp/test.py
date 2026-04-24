from paddlex import create_pipeline

pipeline = create_pipeline(pipeline="formula_recognition")

input_path = "/home/hieunguyenmanh/projects/test_idea/paddle_test/Screenshot from 2026-04-20 14-05-38.png"
output = pipeline.predict(
    input=input_path,
    use_layout_detection=True, 
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
)
for res in output:
    res.print()
    res.save_to_img(save_path="./output/")
    res.save_to_json(save_path="./output/")