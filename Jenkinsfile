pipeline {
    agent any

    environment {
        AWS_REGION       = 'us-west-2'
        ECR_REGISTRY     = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME    = 'my-app-repo'
        EKS_CLUSTER_NAME = 'my-eks-cluster'
        FRONTEND_TAG     = 'frontend-49'
        BACKEND_TAG      = 'backend-46'
    }

    stages {

        stage('SonarQube Analysis') {
    steps {
        withSonarQubeEnv('MySonarQubeServer') {
            sh "/opt/sonar-scanner/bin/sonar-scanner"
             }
          }
      }


        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                script {
                    sh '''
                    aws eks --region $AWS_REGION update-kubeconfig --name $EKS_CLUSTER_NAME

                    # Replace placeholders in K8s manifests with actual image names
                    sed "s|placeholder|$ECR_REGISTRY/$ECR_REPO_NAME:$FRONTEND_TAG|g" k8s/03-frontend.yaml > k8s/03-frontend-temp.yaml
                    sed "s|placeholder|$ECR_REGISTRY/$ECR_REPO_NAME:$BACKEND_TAG|g" k8s/02-backend.yaml > k8s/02-backend-temp.yaml

                    kubectl apply -f k8s/01-mongo.yaml
                    kubectl apply -f k8s/02-backend-temp.yaml
                    kubectl apply -f k8s/03-frontend-temp.yaml
                    kubectl apply -f k8s/04-network-policy.yaml
                    kubectl apply -f k8s/05-ingress.yaml
                    kubectl apply -f k8s/06-ingress-class.yaml
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
